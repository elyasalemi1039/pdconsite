# Supabase Database Configuration

You need TWO database URLs in Vercel environment variables:

## 1. DATABASE_URL (Transaction Pooler)
Used for most queries (fast, pooled connections)

**Format:**
```
postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres?pgbouncer=true
```

**Port:** `6543` (Transaction mode)
**Query parameter:** `?pgbouncer=true`

## 2. DIRECT_DATABASE_URL (Direct Connection)
Used for migrations and schema operations

**Format:**
```
postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:5432/postgres
```

**Port:** `5432` (Direct connection)
**No pgbouncer parameter**

---

## How to Get These URLs from Supabase:

1. Go to https://supabase.com/dashboard/project/[your-project]/settings/database
2. Under "Connection string" → "Transaction pooler" → Copy and use as `DATABASE_URL`
3. Under "Connection string" → "Direct connection" → Copy and use as `DIRECT_DATABASE_URL`

---

## Add to Vercel:

Go to: https://vercel.com/your-project/settings/environment-variables

Add both:
- `DATABASE_URL` = [Transaction pooler URL with ?pgbouncer=true]
- `DIRECT_DATABASE_URL` = [Direct connection URL, port 5432]

Then redeploy!



