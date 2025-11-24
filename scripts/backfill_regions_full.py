#!/usr/bin/env python3
"""
Backfill regions for visit_entries and visits from sales_staff.csv mapping.
Usage:
  python scripts/backfill_regions_full.py --dry-run --service-account ./serviceAccount.json --batch-size 500

Notes:
- Requires firebase-admin installed (see requirements.txt).
- Authentication: by default uses application default credentials. To use a service account, pass --service-account <path>.
- This will page through the whole collections and may take time and incur Firestore read/write costs.
"""
import argparse
import csv
import os
import sys
import time
from typing import Dict, Optional, Tuple

import firebase_admin
from firebase_admin import credentials, firestore


def normalize(s: str) -> str:
    if s is None:
        return ''
    out = str(s).strip()
    # remove BOM
    out = out.replace('\ufeff', '')
    # collapse whitespace
    out = ' '.join(out.split())
    # lower for case-insensitive comparisons (hangul unaffected)
    out = out.lower()
    return out


def load_csv_mapping(path: str) -> Dict[str, str]:
    mapping = {}
    if not os.path.exists(path):
        print(f"CSV not found: {path}")
        return mapping
    with open(path, newline='', encoding='utf-8') as fh:
        reader = csv.reader(fh)
        rows = list(reader)
        if not rows:
            return mapping
        header = rows[0]
        # find index of school and region
        idx_school = -1
        idx_region = -1
        for i, h in enumerate(header):
            if isinstance(h, str) and ("학교명" in h or "학교" in h or "school" in h.lower()):
                idx_school = i
            if isinstance(h, str) and ("지역" in h or "region" in h.lower()):
                idx_region = i
        if idx_school < 0 or idx_region < 0:
            # fallback: try common positions
            # assume school at 4th col (index 4) as in user's sample
            if len(header) > 4:
                idx_school = idx_school if idx_school >= 0 else 4
            if len(header) > 2:
                idx_region = idx_region if idx_region >= 0 else 2

        for r in rows[1:]:
            if len(r) <= max(idx_school, idx_region):
                continue
            school = r[idx_school].strip()
            region = r[idx_region].strip()
            if school:
                mapping[normalize(school)] = region
    return mapping


def match_school_to_region(school: str, mapping: Dict[str, str]) -> Optional[str]:
    if not school:
        return None
    s_norm = normalize(school)
    # exact
    if s_norm in mapping:
        return mapping[s_norm]
    # remove spaces and compare
    key_nospace = s_norm.replace(' ', '')
    for k, v in mapping.items():
        if k.replace(' ', '') == key_nospace:
            return v
    # substring match
    for k, v in mapping.items():
        if k in s_norm or s_norm in k:
            return v
    # token intersection
    s_tokens = set(s_norm.split())
    for k, v in mapping.items():
        if s_tokens & set(k.split()):
            return v
    return None


def process_visit_entries(db, mapping: Dict[str, str], dry_run: bool, batch_size: int) -> Tuple[int, list]:
    print(f"Scanning visit_entries with batch_size={batch_size} (dry_run={dry_run})")
    coll = db.collection('visit_entries')
    last_doc = None
    total_checked = 0
    total_updated = 0
    updated_ids = []
    while True:
        q = coll.order_by('__name__').limit(batch_size)
        if last_doc:
            q = q.start_after(last_doc)
        docs = q.stream()
        batch_docs = list(docs)
        if not batch_docs:
            break
        for d in batch_docs:
            data = d.to_dict() or {}
            total_checked += 1
            school = data.get('school')
            region_now = (data.get('region') or '').strip()
            if school and not region_now:
                region = match_school_to_region(school, mapping)
                if region:
                    print(f"Plan update entry {d.id}: school='{school}' -> region='{region}'")
                    if not dry_run:
                        try:
                            d.reference.update({'region': region})
                            total_updated += 1
                            updated_ids.append(d.id)
                        except Exception as e:
                            print('Failed to update', d.id, e)
        last_doc = batch_docs[-1]
        # small sleep to avoid bursting
        time.sleep(0.1)
    return total_checked, updated_ids


def process_visits_aggregated(db, mapping: Dict[str, str], dry_run: bool, batch_size: int) -> Tuple[int, list]:
    print(f"Scanning visits (aggregated) with batch_size={batch_size} (dry_run={dry_run})")
    coll = db.collection('visits')
    last_doc = None
    total_checked = 0
    updated_ids = []
    while True:
        q = coll.order_by('__name__').limit(batch_size)
        if last_doc:
            q = q.start_after(last_doc)
        docs = q.stream()
        batch_docs = list(docs)
        if not batch_docs:
            break
        for d in batch_docs:
            total_checked += 1
            data = d.to_dict() or {}
            visits = data.get('visits') or []
            changed = False
            for v in visits:
                school = v.get('school') if isinstance(v, dict) else None
                if school and (not v.get('region')):
                    region = match_school_to_region(school, mapping)
                    if region:
                        print(f"Plan update visits doc {d.id} visit school='{school}' -> region='{region}'")
                        if not dry_run:
                            v['region'] = region
                        changed = True
            if changed and not dry_run:
                try:
                    d.reference.update({'visits': visits})
                    updated_ids.append(d.id)
                except Exception as e:
                    print('Failed to update aggregated visits doc', d.id, e)
        last_doc = batch_docs[-1]
        time.sleep(0.1)
    return total_checked, updated_ids


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--service-account', help='Path to service account JSON (optional)')
    parser.add_argument('--csv', default='sales_staff.csv', help='Path to sales_staff.csv')
    parser.add_argument('--dry-run', action='store_true', help='Do not apply updates')
    parser.add_argument('--batch-size', type=int, default=500, help='Batch size per page')
    args = parser.parse_args()

    # init firebase
    try:
        if args.service_account:
            cred = credentials.Certificate(args.service_account)
            firebase_admin.initialize_app(cred)
        else:
            firebase_admin.initialize_app()
    except Exception as e:
        print('Failed to initialize firebase_admin:', e)
        sys.exit(1)

    db = firestore.client()

    mapping = load_csv_mapping(args.csv)
    print('Loaded mapping keys:', len(mapping))

    ce_checked, entries_updated = process_visit_entries(db, mapping, args.dry_run, args.batch_size)
    print(f"visit_entries: checked={ce_checked}, updates={len(entries_updated)}")

    cv_checked, visits_updated = process_visits_aggregated(db, mapping, args.dry_run, args.batch_size)
    print(f"visits (aggregated): checked={cv_checked}, updates={len(visits_updated)}")

    print('Done.')


if __name__ == '__main__':
    main()
