# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

WORKDIR /app

# Copiar arquivos de dependência primeiro (cache do Docker)
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Copiar código-fonte e buildar
COPY . .
RUN pnpm build

# ── Stage 2: Runtime (imagem limpa, só produção) ─────────────────────────────
FROM node:20-alpine

RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

WORKDIR /app

# Instalar apenas dependências de produção
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

# Copiar apenas o necessário do builder
COPY --from=builder /app/dist ./dist

# Copiar schema e config do Drizzle para migração automática
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/drizzle.config.ts ./

# Criar diretórios de upload para o volume mapear corretamente
RUN mkdir -p uploads/arvores uploads/regioes

EXPOSE 3000

# Migração automática: drizzle-kit push compara o schema com o banco
# e cria/altera tabelas antes de iniciar o servidor
CMD ["sh", "-c", "npx drizzle-kit push --force && node --experimental-detect-module dist/index.js"]
