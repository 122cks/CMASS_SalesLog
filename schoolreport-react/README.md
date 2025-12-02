# Schoolreport React (Vite + Tailwind)

This is a small React + Vite + Tailwind scaffold to run the `schoolreport` UI.

Prereqs: Node.js (16+ recommended), npm or yarn.

Install and run:

```bash
cd schoolreport-react
npm install
npm run dev
```

Build:

```bash
npm run build
npm run preview
```

Notes:
- The app uses embedded sample data (`RAW_DATA`, `SCHOOL_INFO`, `TEXTBOOK_ORDERS`) in `src/App.jsx`.
- To connect Firestore, add Firebase initialization in `src/main.jsx` and fetch documents into state (left as optional).
- To deploy to Firebase Hosting, build the site and copy `dist/` into your hosting public directory or configure `firebase.json` to serve from `schoolreport-react/dist`.
