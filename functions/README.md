# aggregateVisitEntries Cloud Function

This folder contains a simple HTTP Cloud Function `aggregateVisitEntries` that reads documents from the `visit_entries` collection and returns aggregated buckets useful for the dashboard (byDate, subjects, activities, regions, hours, topTeachers).

Usage

- Install dependencies:

```pwsh
cd functions
npm install
```

- To run locally with the Firebase emulator:

```pwsh
firebase emulators:start --only functions
```

The function will be available at `http://localhost:5001/<project>/us-central1/aggregateVisitEntries` (emulator logs show exact URL).

- To deploy to Firebase:

```pwsh
cd functions
npm install
firebase deploy --only functions
```

Notes

- For large datasets consider adding server-side pagination or pre-aggregations (Cloud Scheduler + aggregation into a separate collection). This simple implementation fetches up to 8000 docs to avoid memory blowups.
- The function allows query params: `staff`, `start` (YYYY-MM-DD), `end` (YYYY-MM-DD), `region`, `subject`.
