# thesain26

Marketplace de produtos digitais em cima da Whop (Whop for Platforms). Vendedores abrem loja, passam pelo KYC e sacam na própria thesain26. O checkout fica embutido. A thesain26 fica com uma comissão automática em cada venda, no modelo de **Direct Charges** (`application_fee_amount`).

## O que a plataforma faz

- Cadastro do vendedor com nome, loja, descrição, site ou rede, tipo de negócio, indústria e país. A Connected Account nasce na Whop e o perfil segue por `accounts.update`.
- Análise do negócio em `/painel/verificacoes?secao=negocio`. O formulário mostra só as perguntas abertas na Whop naquele momento e responde com `verifications.update`. O link da aba Verificações da Whop fica só como alternativa e pede login.
- Identidade em `/painel/verificacoes`, com Account Link (`use_case: account_onboarding`) embutido. Saque continua no `payouts_portal`.
- Saldo, reserva, carteiras e saque na própria página `/painel/saldo`, sem sair do site. O admin vê pendente do dia seguinte, reservas de 14 e 30 dias, e o que já foi sacado.
- Vendas listadas ao abrir a página (webhook em tempo real e sincronização de fallback), com filtro e CSV.
- Loja, produtos e checkout embutido (`WhopCheckoutEmbed`). Em novo produto, um texto com o preço monta nome, descrição, tipo e valor pela IA (`XAI_API_KEY`).
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
3. Account Links de KYC voltam para `/painel/verificacoes`. Carteira e saque ficam em `/painel/saldo`.
4. Em localhost a Whop não entrega webhook. A página de vendas sincroniza ao abrir. Um túnel (ngrok, Cloudflare Tunnel) entrega o evento na hora.
5. O `redirect_url` do checkout só é enviado quando `NEXT_PUBLIC_APP_URL` começa com `https://`. No embed local, o retorno do comprador usa `returnUrl`.

Os pontos de integração estão comentados em `lib/whop.ts`.

## Scripts

| Comando | O que faz |
| --- | --- |
| `npm run dev` | Servidor de desenvolvimento na porta 43123 |
| `npm run db:setup` | Sincroniza o PostgreSQL e cria o dono da plataforma |
| `npm run lint` | ESLint |
| `npm run build` | Build de produção |

O banco é PostgreSQL (`provider = "postgresql"` no `schema.prisma`). Aponte `DATABASE_URL` para o Postgres local ou para a Internal Database URL da Render.
