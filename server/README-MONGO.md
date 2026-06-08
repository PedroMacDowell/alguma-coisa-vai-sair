# MongoDB Integration (optional)

This project supports an optional MongoDB backend. If `MONGO_URI` is provided the server will use MongoDB for storing students and meta information. Otherwise it will keep using the JSON file fallback (`data/school-store.json`).

How to test locally

1. Install dependencies in the `server` folder:

```bash
cd server
npm install
```

2. Start a local MongoDB (example using Docker):

```bash
docker run -d -p 27017:27017 --name mongo-local mongo:6
```

3. Set environment variables and start the server:

```bash
# Linux / macOS
export MONGO_URI="mongodb://127.0.0.1:27017"
export MONGO_DB="school_register"
npm run dev

# Windows PowerShell
$env:MONGO_URI = "mongodb://127.0.0.1:27017"
$env:MONGO_DB = "school_register"
npm run dev
```

4. The server will create `students` and `meta` collections on first writes. If you revert to no `MONGO_URI`, the app will continue using the file store.

Notes

- The integration is intentionally conservative: it keeps the original JSON store as a fallback and mirrors operations to Mongo when `MONGO_URI` is set.
- If you want, I can add a migration script to copy JSON store data into MongoDB the first time you enable it.