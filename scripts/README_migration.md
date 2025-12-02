Firestore `ask` → `request` Migration
===================================

This folder contains a migration helper to copy `ask` -> `request` for documents in a Firestore collection.

Prerequisites
- Node.js installed
- `firebase-admin` package
- A service account JSON file (the user provided one at `public/cmass-sales-dabccd916a67.json`)

Install dependency:

```pwsh
npm install firebase-admin
```

Dry-run (recommended first):

```pwsh
node .\scripts\migrate_ask_to_request.js --key ".\public\cmass-sales-dabccd916a67.json" --collection visit_entries
```

This prints documents that would be changed without applying.

Apply changes (makes updates):

```pwsh
node .\scripts\migrate_ask_to_request.js --key ".\public\cmass-sales-dabccd916a67.json" --collection visit_entries --apply true --remove-old true
```

Options
- `--key` (required): path to service account JSON
- `--collection` (default `visit_entries`): collection to migrate
- `--apply true`: actually commit changes (omit to do dry-run)
- `--remove-old true`: remove the `ask` field after copying (recommended)
- `--backup-field NAME` (default `_backup_ask`): stores original `ask` value in this field when applying

Notes
- Script updates documents in batches. It only updates documents that have `ask` and do not already have a `request` value.
