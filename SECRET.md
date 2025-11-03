Secret & IAM (Cloud Run deployment)

This project stores the 4-digit staff PIN map in Secret Manager and injects it into the Cloud Run service as an environment variable named `PIN_MAP_JSON`.

- Secret name: `cmass_pin_map`
- The secret value should be a UTF-8 encoded JSON string of the form:

  {"송훈재":"8747","임준호":"1203","조영환":"0686"}

- Cloud Run needs to be deployed with the secret mounted using `--update-secrets=PIN_MAP_JSON=cmass_pin_map:latest` so that the Flask backend reads the value from the environment.

- IAM: The Cloud Run revision service account (the service account used by the service; for example `PROJECT_NUMBER-compute@developer.gserviceaccount.com`) must have the Secret Manager Secret Accessor role so it can read the secret. Example command (run as a project owner or with the required IAM privileges):

```
gcloud projects add-iam-policy-binding <PROJECT_ID> \
  --member="serviceAccount:<SERVICE_ACCOUNT_EMAIL>" \
  --role="roles/secretmanager.secretAccessor"
```

Or bind the role specifically to the secret:

```
gcloud secrets add-iam-policy-binding cmass_pin_map \
  --member="serviceAccount:<SERVICE_ACCOUNT_EMAIL>" \
  --role="roles/secretmanager.secretAccessor" --project=<PROJECT_ID>
```

Replace `<PROJECT_ID>` and `<SERVICE_ACCOUNT_EMAIL>` with your project id and the Cloud Run service account.

If the secret contains non-UTF8 data the Cloud Run revision will fail to start; ensure the secret version is UTF-8 encoded text (JSON) before deploying.
