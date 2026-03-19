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

# Criar diretórios de upload para o volume mapear corretamente
RUN mkdir -p uploads/arvores uploads/regioes

EXPOSE 3000

CMD ["node", "--experimental-detect-module", "dist/index.js"]
