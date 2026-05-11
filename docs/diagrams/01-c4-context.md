# C4 — System Context

System Context view of PFOS (Personal Financial Operating System).

```mermaid
%%{init: {'theme':'neutral'}}%%
flowchart LR
    user(("👤 Користувач<br/>(власник фінансів)"))

    pfos["📊 PFOS<br/>(система управління<br/>персональними фінансами)"]:::system

    subgraph external [Зовнішні системи]
        mono[("🏦 Monobank API<br/>statement + webhooks")]
        supabase[("🔐 Supabase Auth<br/>+ Postgres + Storage")]
        openai[("🤖 OpenAI API<br/>chat + embeddings")]
        email[("✉️ Email gateway<br/>(Phase 7+)")]
        telegram[("💬 Telegram Bot API<br/>(Phase 7+)")]
    end

    user -- "Перегляд бюджетів,<br/>цілей, інсайтів<br/>через Web UI" --> pfos
    user -- "Чат-діалог з AI,<br/>підтвердження мутацій" --> pfos
    user -- "Авторизація<br/>(email + password)" --> supabase
    user -- "Отримання<br/>сповіщень" --> email
    user -- "Отримання<br/>сповіщень" --> telegram

    pfos -- "Auth tokens,<br/>RLS-secured persistence" --> supabase
    pfos -- "Pull statement,<br/>register webhook" --> mono
    mono -- "POST /webhooks/monobank<br/>(нові транзакції)" --> pfos
    pfos -- "Chat completions,<br/>embeddings" --> openai
    pfos -- "Send notifications" --> email
    pfos -- "Send notifications" --> telegram

    classDef system fill:#3b82f6,stroke:#1d4ed8,color:#fff
```

## Stakeholders

| Actor | Role |
|---|---|
| **Користувач** | Особа, яка планує бюджети, ставить цілі, читає рекомендації, спілкується з AI |
| **Monobank API** | Postavalнік транзакцій (PFOS — read-only пасивний споживач) |
| **Supabase** | Identity & RLS-захищене сховище (Auth + Postgres + (опційно) Storage) |
| **OpenAI** | LLM-провайдер (chat-completions для агентів + embeddings для memory/recommendations) |
| **Email/Telegram** | Опціональні канали delivery (зараз stubs у `notifications/channels`) |

## Out-of-scope

- Інтеграція з податковою / банками крім Monobank
- Investment broker APIs
- Crypto wallet sync
- Multi-tenant (B2B) сценарії
