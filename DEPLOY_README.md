Deploying the updated site (meeting.html) to Firebase Hosting

Follow these steps from PowerShell on your development machine. These commands assume you already have Node.js and npm installed.

1) Install the Firebase CLI (if not already installed):

npm install -g firebase-tools

2) Log in to Firebase and select your project:

# log in (opens the browser for auth)
firebase login

# optionally list projects and choose one
firebase projects:list

# set the project you'll deploy to (replace <PROJECT_ID> with your Firebase project id)
firebase use --add <PROJECT_ID>

3) Deploy hosting (this uploads the `public/` folder which now contains `meeting.html` and `meeting.js`):

# from the repository root
cd 'c:\Users\PC\OneDrive\cmass-sales-system\CMASS_SalesLog'

# deploy hosting + functions (recommended)
firebase deploy --only hosting,functions

Notes:
- firebase.json is configured to serve the public folder. If your real Firebase project expects a different folder, update firebase.json accordingly.
 - The meeting.js client posts to /save-meeting. This repo now includes a Cloud Function (exported as `api`) and a hosting rewrite so `/save-meeting` is routed to the function. Deploy using the command above to publish both hosting and functions.
 - The function persists meeting records to Firestore under the `meetings` collection. If the client sends `server_id` it will be used as the document id (allowing updates); otherwise an auto-id is created.
 - If you'd like different persistence (Cloud Storage or a specific Firestore schema), tell me and I can adapt the function.
