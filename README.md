# thesain26

Marketplace de produtos digitais em cima da Whop (Whop for Platforms). Vendedores abrem loja, passam pelo KYC e pelos saques oficiais da Whop, e vendem com checkout embutido. A thesain26 fica com uma comissão automática em cada venda, no modelo de **Direct Charges** (`application_fee_amount`).

## O que a plataforma faz

- Cadastro e login de vendedores (email e senha).
- Connected Account na Whop no cadastro, com o `biz_id` salvo no usuário.
- KYC por Account Link (`use_case: account_onboarding`).
- Saldo e saques por Account Link (`use_case: payouts_portal`) e pelo `BalanceElement` da Whop.
- Loja, produtos e checkout embutido (`WhopCheckoutEmbed`).
- Webhook em `/api/webhooks/whop` para registrar pagamentos.
- Painel do dono com vendedores, status de KYC, vendas e total de comissões.

A comissão padrão é **5%**. O dono altera a taxa global e, se quiser, a taxa de um vendedor.

## Requisitos

- Node.js 20+
- Conta de plataforma na Whop e uma Account API key

## Setup

```bash
cp .env.example .env
# preencha NEXTAUTH_SECRET e, quando for receber eventos, WHOP_WEBHOOK_SECRET

npm install
npm run db:setup
npm run dev
```

O app sobe em [http://127.0.0.1:43123](http://127.0.0.1:43123).

O seed cria o dono da plataforma:

- Email: `dono@thesain26.com`
- Senha: `thesain26-dono`

Troque a senha antes de expor o ambiente.

## Whop

1. A `WHOP_API_KEY` precisa ser uma **Account API key** da conta da plataforma, com permissão para criar connected accounts, account links, checkout configurations, ler saldo e listar pagamentos.
2. No dashboard da Whop, crie um webhook apontando para `https://seu-dominio/api/webhooks/whop` e copie o segredo `ws_...` para `WHOP_WEBHOOK_SECRET`. Eventos úteis: `payment.succeeded`, `payment.failed`, `payment.pending`, `refund.created`, `verification.succeeded`, `payout_account.status_updated`.
3. Account Links de KYC e de saque voltam para `/painel` e `/painel/saldo`.
4. Em localhost a Whop não entrega webhook. Use um túnel (ngrok, Cloudflare Tunnel) ou o botão **Sincronizar com a Whop** nas vendas do vendedor.
5. O `redirect_url` do checkout só é enviado quando `NEXT_PUBLIC_APP_URL` começa com `https://`. No embed local, o retorno do comprador usa `returnUrl`.

Os pontos de integração estão comentados em `lib/whop.ts`.

## Scripts

| Comando | O que faz |
| --- | --- |
| `npm run dev` | Servidor de desenvolvimento na porta 43123 |
| `npm run db:setup` | Cria o SQLite e o dono da plataforma |
| `npm run lint` | ESLint |
| `npm run build` | Build de produção |

O banco local é SQLite (`prisma/dev.db`). Para produção, troque o provider no `schema.prisma` para PostgreSQL e ajuste `DATABASE_URL`.
