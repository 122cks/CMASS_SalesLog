#!/usr/bin/env node
/**
 * scripts/fill_region_from_sales_staff.js
 *
 * Safe script to fill missing/placeholder `region` fields in Firestore `visit_entries`
 * using a mapping read from a CSV of schools -> regions (`public/sales_staff.csv`).
 *
 * Usage (dry-run):
 *   setx GOOGLE_APPLICATION_CREDENTIALS "C:\path\to\sa.json"  # or set in current shell
 *   node scripts/fill_region_from_sales_staff.js --project cmass-sales --csv public/sales_staff.csv
 *
 * Apply changes:
 *   node scripts/fill_region_from_sales_staff.js --project cmass-sales --csv public/sales_staff.csv --apply
 *
 * Options:
 *   --project <projectId>
 *   --csv <path>        default: public/sales_staff.csv
 *   --batchSize <N>     default: 200
 *   --apply             actually write updates (omit for dry-run)
 */

const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

function parseArgs() {
  const argv = process.argv.slice(2);
  const opts = { csv: 'public/sales_staff.csv', batchSize: 200, apply: false, listIds: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--csv') opts.csv = argv[++i];
    else if (a === '--project') opts.project = argv[++i];
    else if (a === '--batchSize') opts.batchSize = parseInt(argv[++i], 10) || 200;
    else if (a === '--apply') opts.apply = true;
    else if (a === '--list-ids') opts.listIds = true;
    else if (a === '--help' || a === '-h') {
      console.log('Usage: node scripts/fill_region_from_sales_staff.js --project <projectId> [--csv path] [--batchSize N] [--apply]');
      process.exit(0);
    }
  }
  if (!opts.project) {
    console.error('Missing --project <projectId>');
    process.exit(2);
  }
  return opts;
}

function parseCSV(content) {
  // Simple CSV parser that handles quoted fields with commas.
  const lines = content.split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return [];
  const header = parseLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const fields = parseLine(lines[i]);
    if (fields.length === 0) continue;
    const obj = {};
    for (let j = 0; j < header.length; j++) {
      obj[header[j]] = fields[j] !== undefined ? fields[j] : '';
    }
    rows.push(obj);
  }
  return rows;
}

function parseLine(line) {
  const res = [];
  let cur = '"';
  cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        // escaped quote
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      res.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  res.push(cur);
  return res.map(s => s.trim());
}

function normalizeSchool(s) {
  if (!s) return '';
  // to lower, remove punctuation and extra whitespace
  return s
    .toString()
    .trim()
    .replace(/[\u3000\s]+/g, ' ') // normalize spaces incl full-width
    .toLowerCase()
    .replace(/[\.,()"'\-\/:]/g, '')
    .replace(/\s+/g, ' ')
    ;
}

async function main() {
  const opts = parseArgs();
  const csvPath = path.resolve(opts.csv);
  if (!fs.existsSync(csvPath)) {
    console.error('CSV file not found:', csvPath);
    process.exit(3);
  }
  const csvContent = fs.readFileSync(csvPath, 'utf8');
  const rows = parseCSV(csvContent);
  // build mapping school -> region
  const map = new Map();
  for (const r of rows) {
    const school = r['school'] || r['학교명'] || r['학교'];
    const region = r['region'] || r['지역'] || r['교육지원청'] || r['교육지원청'];
    if (school && region) {
      const key = normalizeSchool(school);
      if (!key) continue;
      // prefer first occurrence; but if duplicate, keep existing
      if (!map.has(key)) map.set(key, region.trim());
    }
  }

  console.log(`Loaded ${map.size} school->region mappings from ${csvPath}`);

  // init admin
  try {
    admin.initializeApp({ projectId: opts.project });
  } catch (e) {
    // if already initialized, ignore
  }
  const db = admin.firestore();

  console.log('Scanning visit_entries collection... (this will stream all docs)');
  const snapshot = await db.collection('visit_entries').get();
  console.log('Total visit_entries docs:', snapshot.size);

  const candidates = [];
  snapshot.forEach(doc => {
    const data = doc.data() || {};
    const schoolRaw = data.school || data.school_name || data.schoolName || '';
    const regionRaw = data.region;
    const regionEmpty = (regionRaw === undefined || regionRaw === null || String(regionRaw).trim() === '' || String(regionRaw).trim() === '??????');
    if (!schoolRaw) return; // skip if no school
    if (!regionEmpty) return; // skip if region already present
    const normalized = normalizeSchool(schoolRaw);
    if (!normalized) return;
    let foundRegion = map.get(normalized);
    let matchMethod = 'exact';
    if (!foundRegion) {
      // try fuzzy: try keys that are substrings
      for (const [k, v] of map.entries()) {
        if (normalized.includes(k) || k.includes(normalized)) {
          foundRegion = v;
          matchMethod = 'fuzzy';
          break;
        }
      }
    }
    if (foundRegion) {
      candidates.push({ id: doc.id, school: schoolRaw, proposedRegion: foundRegion, method: matchMethod });
    }
  });

  console.log(`Candidates found (would update): ${candidates.length}`);
  if (candidates.length > 0) {
    if (opts.listIds) {
      // print full list of ids and proposed region
      for (const c of candidates) {
        console.log(`${c.id},${c.school},${c.proposedRegion},${c.method}`);
      }
    } else {
      console.log('Examples:');
      for (let i = 0; i < Math.min(10, candidates.length); i++) {
        const c = candidates[i];
        console.log(`  ${c.id}  school="${c.school}" -> region="${c.proposedRegion}" (${c.method})`);
      }
    }
  }

  if (!opts.apply) {
    console.log('\nDry-run complete. To apply updates run with --apply');
    console.log('Total candidates:', candidates.length);
    process.exit(0);
  }

  // apply updates in batches
  console.log('Applying updates...');
  let batch = db.batch();
  let writes = 0;
  let batchCount = 0;
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    const ref = db.collection('visit_entries').doc(c.id);
    batch.update(ref, { region: c.proposedRegion });
    writes++;
    if (writes % opts.batchSize === 0) {
      batchCount++;
      await batch.commit();
      console.log(`  committed batch ${batchCount} (${writes} updates total)`);
      batch = db.batch();
    }
  }
  // commit remainder
  if (writes % opts.batchSize !== 0) {
    batchCount++;
    await batch.commit();
    console.log(`  committed final batch ${batchCount} (${writes} updates total)`);
  }

  console.log('Apply complete. Updated documents:', writes);
  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
