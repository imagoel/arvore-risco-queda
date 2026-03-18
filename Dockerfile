FROM node:20-alpine

# Habilitar e instalar o pnpm via corepack
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

WORKDIR /app

# Copiar arquivos de dependência primeiro (para usar o cache do Docker)
COPY package.json pnpm-lock.yaml ./

# Instalar dependências usando o pnpm
RUN pnpm install --frozen-lockfile

# Copiar o restante do projeto
COPY . .

# Build do servidor com esbuild
RUN pnpm build

# Copiar painel.html para dist/ (fix do __dirname no ESM build)
RUN cp server/painel.html dist/painel.html

# Criar diretórios de upload para o volume mapear corretamente
RUN mkdir -p uploads/arvores uploads/regioes

EXPOSE 3000

CMD ["node", "--experimental-detect-module", "dist/index.js"]