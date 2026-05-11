# 08. Must-have vs Optional фічі

## 1. Must-have (без цього магістерська слабка)

### Backend
1. **Budgeting Engine** — хоча б 2 методи: category + envelope
2. **Goal Planning** — з feasibility score (Monte Carlo)
3. **Cashflow Forecasting** — хоча б Prophet baseline + LLM adjuster
4. **Recommendation Engine** — hybrid: rules + LLM (ML можна optional)
5. **Rule Engine** — з UI builder
6. **Multi-agent AI** — мінімум 3 агенти (Analyst, Planner, Forecaster)
7. **AI Memory** — хоча б semantic + episodic
8. **Notification Orchestration** — мінімум in-app + email
9. **Event-driven backbone** — outbox + queues
10. **Domain Events catalog** — формальний перелік
11. **Personalization layer** — UserProfile з risk tolerance + tone

### Frontend
12. **Dashboard з Health Score**
13. **Budgets UI** — з envelope ladder
14. **Goals UI** — з progress і feasibility
15. **Cashflow chart** — з projection + deficit detection
16. **Recommendations Inbox** — з accept/reject/snooze
17. **AI Chat (refactored)** — з action chips і two-step confirmation
18. **Rules studio** — basic builder
19. **Explanations** — для головних KPI

### Документація
20. **UML/BPMN/sequence діаграми** — мінімум 8-10 діаграм
21. **C4 architecture diagrams** — Context + Container + Component
22. **ER-діаграма** БД
23. **Deployment diagram**
24. **API documentation** — OpenAPI / Swagger
25. **AI Tool Catalog** — formal document

## 2. Optional, але сильно підсилює (high-value additions)

### Технічні підсилення
1. **Scenario Simulation engine** з Monte Carlo + sensitivity analysis
2. **Behavior modeling** — cluster аналіз (K-means на feature vectors)
3. **Explainability layer** — SHAP-like для ML-based recommendations
4. **Federated knowledge base** — RAG над фінансовою освітою (UA-specific)
5. **A/B testing framework** для рекомендацій
6. **Privacy-preserving aggregations** (peer comparison без leak)
7. **Multi-currency** support
8. **Open Banking adapter pattern** — готовність до інших банків
9. **Investment tracking module**
10. **Tax planning insights** (UA податкова специфіка)

### UX-підсилення
11. **Voice interface** для AI-chat
12. **Telegram bot** як alt-channel
13. **PWA + offline-first**
14. **Goal collaboration** — shared goals для пар
15. **Gamification** — streaks, achievements за savings goals
16. **Educational content layer** — micro-lessons на основі behavior

### AI-підсилення
17. **Reflexion mechanism** для improvement loops
18. **Tool composition** — agent може створювати composite tools
19. **Long-term planning agent** — multi-month strategies
20. **Anomaly investigator agent** — proactive fraud detection
21. **Adversarial testing** — red-team prompts для guardrails
22. **Multi-modal inputs** — фото чеків (OCR + LLM)

## 3. Можна не робити для магістерської

- Real banking integration crypto/securities
- Advanced ML models (LSTM, Transformer для time-series)
- Production-grade scaling (Kubernetes, multi-region)
- Compliance certifications (PCI DSS, ISO 27001)
- Mobile native apps (iOS/Android native)
- B2B / multi-tenant функціональність
- Integration with accounting tools (QuickBooks, Xero)

## 4. Пріоритезація (для roadmap)

**Tier 1 (must — без цього not magister):**
- Event-driven backbone
- Budgeting + Goals + Cashflow + Rules + Recommendations engines
- Multi-agent AI з memory
- Core UI (dashboard, budgets, goals, recommendations, chat)

**Tier 2 (high value — реалізувати, якщо час):**
- Scenarios sandbox
- Notification orchestration full suite
- Behavior modeling
- Explainability layer
- Knowledge base RAG

**Tier 3 (nice-to-have):**
- Voice interface
- Telegram bot
- Gamification
- Investment module
- Multi-currency

**Tier 4 (показати тільки в "future work"):**
- Multi-tenant
- Mobile native
- Compliance
- Advanced ML

## 5. Компроміси

Якщо критично мало часу:

| Фіча | Скорочений варіант |
|---|---|
| Budgeting | Тільки category-based, без envelope |
| Cashflow forecast | Простий averaging-based, без Prophet/Monte Carlo |
| Recommendation Engine | Тільки rule-based + LLM, без ML |
| Multi-agent | 2 агенти замість 7 |
| Memory | Тільки semantic + episodic, без procedural/decay |
| Rule Engine | Predefined templates замість free AST |
| Notifications | Тільки in-app, без email/push |
| UI | Тільки 4-5 ключових сторінок |

Але кожен compromise треба чесно описати у "Обмеження" розділу 5.

## 6. Defensive checklist (що показувати на захисті)

✅ **Сильні сторони, які точно треба продемонструвати:**
1. Жива demo з реальними транзакціями
2. AI-chat з мутаціями (приклад: створення ц цілі через діалог)
3. Recommendation Inbox з actual recommendations
4. Cashflow projection з deficit detection
5. Architecture diagrams (C4 + UML)
6. Domain Events catalog з прикладами
7. Tool Catalog з контрактами

✅ **Очікувані запитання і відповіді:**
- *"Чим це відрізняється від Mint/YNAB?"* → AI-augmented management, proactive recommendations, conversational mutations
- *"Чому DDD?"* → cross-context complexity, незалежність деплою
- *"Чому multi-agent?"* → tool focus per agent, scalable cognitive load, кращий debugging
- *"Як ви валідуєте AI-recommendations?"* → human-in-the-loop, two-step confirmations, explainability
- *"Як ви боретесь з hallucinations?"* → guardrails, claim verification, structured outputs
- *"Як це працюватиме в проді?"* → deployment diagram, scaling strategy, observability

## 7. Red flags (чого уникати)

❌ "AI магічно щось робить" — без формалізації
❌ Лише free-form chat без structured tools
❌ CRUD без бізнес-логіки (e.g., budgets без enforcement)
❌ Recommendations без feedback loop
❌ Forecasting без confidence intervals
❌ Rules без AST/sandbox
❌ Без діаграм
❌ Без академічних посилань
❌ Без розділу про обмеження

## 8. Якісні (а не кількісні) метрики магістерської

Магістерську оцінюють НЕ за кількістю фіч, а за:
1. **Архітектурною зрілістю** — чи проєкт показує системне мислення
2. **Науковою новизною** — що формалізовано вперше
3. **Технічною глибиною** — наскільки детально описані рішення
4. **Якістю реалізації** — чи код production-ready
5. **Якістю документації** — діаграми, обґрунтування, посилання
6. **Емпіричними результатами** — метрики, A/B тести, оцінка
