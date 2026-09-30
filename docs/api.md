# FlowMoney API v1 Contract

All protected endpoints resolve the user from the authenticated session or validated Telegram context. Responses use:

```json
{ "success": true, "data": {} }
```

Errors use:

```json
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "Amount must be greater than zero" } }
```

## Endpoints

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/v1/dashboard?month=YYYY-MM` | Dashboard summary and derived metrics |
| `GET` | `/api/v1/transactions` | List the authenticated user's transactions |
| `POST` | `/api/v1/transactions` | Create income or expense |
| `PUT` | `/api/v1/transactions/:id` | Update an owned transaction |
| `DELETE` | `/api/v1/transactions/:id` | Soft-delete an owned transaction |
| `GET` | `/api/v1/wallets` | List active wallets |
| `GET` / `PUT` | `/api/v1/profile` | Read or update the authenticated user's profile name |
| `GET` | `/api/v1/assets?kind=aset\|crypto\|saham` | List active user-owned asset holdings |
| `POST` | `/api/v1/assets` | Create an asset or holding |
| `PUT` | `/api/v1/assets/:id` | Update the manually entered current price |
| `DELETE` | `/api/v1/assets/:id` | Soft-delete an owned asset or holding |
| `GET` | `/api/v1/budgets?month=YYYY-MM` | List derived budget usage |
| `GET` | `/api/v1/goals` | List active goals and contribution totals |
| `GET` | `/api/v1/analytics?month=YYYY-MM` | Derived category, daily, and monthly analytics |
| `POST` | `/api/v1/telegram/auth` | Validate Mini App init data and create context |
| `POST` | `/api/v1/telegram/webhook` | Receive secret-protected bot updates |

Transaction creation accepts positive amounts only:

```json
{
  "type": "expense",
  "amount": 50000,
  "currency": "IDR",
  "categoryId": "category-id",
  "walletId": "wallet-id",
  "date": "2026-09-15",
  "time": "13:20",
  "note": "Lunch"
}
```

Every resource query must include the authenticated `user_id` in its repository predicate. A resource ID alone is never sufficient authorization.