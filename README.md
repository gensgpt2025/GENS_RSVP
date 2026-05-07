# GENS Schedule

Private schedule and RSVP management app for pre-registered members.

## Features

- Member-only login
- Admin-only member registration
- Admin-only event creation
- RSVP responses: attending, declined, maybe
- Google Calendar link and `.ics` export
- Persistent storage with Neon Postgres on Vercel

## Environment Variables

Set these variables on Vercel. `DATABASE_URL` is preferred. `POSTGRES_URL` also works.

```env
DATABASE_URL="postgres://user:password@host/database?sslmode=require"
ADMIN_EMAIL="admin@example.com"
ADMIN_PASSWORD="change-this-password"
ADMIN_NAME="Admin"
```

The app creates its tables automatically on first access. If `ADMIN_EMAIL` and `ADMIN_PASSWORD` are set, the first admin account is also created automatically.

## Development

```bash
npm install
npm run dev
```

For production use, connect a Neon Postgres database in Vercel and deploy from GitHub.
