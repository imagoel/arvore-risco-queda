# Risco de Queda

Sistema de avaliacao de risco de queda de arvores para analistas ambientais. Combina um app mobile (Expo/React Native) para trabalho em campo com um painel administrativo web para gerenciamento dos dados.

## O que faz

- **Marcacao de arvores no mapa** com coordenadas GPS automaticas
- **Calculo do IRQ** (Indice de Risco de Queda) com 9 parametros dendrometricos
- **Foto com carimbo automatico** (nome, IRQ, coordenadas, data/hora) — substitui o Timestamp Camera
- **Demarcacao de regioes** com poligonos no mapa
- **Sincronizacao offline-first** — funciona sem internet, sincroniza quando conectar
- **Painel web** para visualizar, filtrar e excluir arvores e regioes
- **Exportacao KMZ** para Google Earth / QGIS
- **Relatorio Word (.docx)** com fotos e dados de cada arvore

## Tech Stack

| Camada | Tecnologia |
|--------|-----------|
| App Mobile | Expo 54, React Native 0.81, React 19 |
| Navegacao | Expo Router (file-based) |
| Mapa | React Native Maps (Google Maps) |
| Carimbo de foto | react-native-image-marker |
| Backend | Express 4.22, tRPC 11.7 |
| Banco de dados | MySQL 8.0, Drizzle ORM |
| Relatorio | docx (Word), Archiver (KMZ) |
| Infra | Docker, EAS Build |
| Linguagem | TypeScript 5.9 |
| Testes | Vitest |

## Estrutura do Projeto

```
arvore-app/
├── app/(tabs)/              # Telas do app (Calculadora, Mapa)
│   ├── index.tsx            # Calculadora IRQ
│   └── mapa.native.tsx      # Mapa interativo (iOS/Android)
├── lib/                     # Logica de negocio
│   ├── irq.ts               # Calculo do IRQ
│   ├── carimbar-foto.ts     # Carimbo de foto
│   └── sync.ts              # Motor de sincronizacao
├── server/                  # Backend Node.js
│   ├── _core/index.ts       # Express + rotas
│   ├── routers.ts           # tRPC endpoints
│   ├── db.ts                # CRUD banco de dados
│   ├── kmz.ts               # Exportacao KMZ
│   ├── relatorio.ts         # Geracao de relatorio Word
│   ├── upload-local.ts      # Upload de fotos (Multer)
│   └── painel.html          # Painel administrativo web
├── drizzle/schema.ts        # Schema do banco (arvores, regioes, users)
├── tests/                   # Testes unitarios
├── docker-compose.yml       # MySQL + Server
├── Dockerfile               # Build multi-stage
└── eas.json                 # Config do EAS Build
```

## Como Rodar

### Pre-requisitos

- Docker e Docker Compose
- Node.js 20+ e pnpm 9.12 (para desenvolvimento)

### Producao (Docker)

```bash
git clone <repo-url>
cd arvore-app

# Criar arquivo .env (veja secao Variaveis de Ambiente)
cp .env.example .env
# Editar .env com seus valores

# Subir os servicos
docker compose up -d --build
```

Isso inicia:
- **MySQL** em `localhost:3306`
- **Server + Painel** em `http://localhost:3000/painel`

### Desenvolvimento

```bash
pnpm install
pnpm dev          # Server + Metro bundler
pnpm android      # App no Android
pnpm ios          # App no iOS
```

### Build do APK

```bash
npm install -g eas-cli
eas login
eas build --platform android --profile preview
```

O APK sera gerado na nuvem do EAS e disponibilizado para download.

## Variaveis de Ambiente

Criar um arquivo `.env` na raiz do projeto:

```bash
# Banco de dados
MYSQL_ROOT_PASSWORD=senha-forte-aqui
MYSQL_DATABASE=arvore_db

# Servidor
PUBLIC_URL=http://SEU-IP:3000

# Google Maps — Painel Web
GOOGLE_MAPS_API_KEY=sua-chave-aqui

# Google Maps — App Mobile (embutido no APK)
EXPO_PUBLIC_GOOGLE_MAPS_MOBILE_KEY=sua-chave-mobile-aqui
EXPO_PUBLIC_API_BASE_URL=http://SEU-IP:3000
```

> **Nota:** As variaveis `EXPO_PUBLIC_*` sao embutidas no APK durante o build. Alterar elas requer rebuildar o APK.

## Scripts

| Comando | Descricao |
|---------|-----------|
| `pnpm dev` | Inicia server + Metro (desenvolvimento) |
| `pnpm build` | Compila server para `dist/` (esbuild) |
| `pnpm start` | Roda server em producao |
| `pnpm test` | Roda testes unitarios |
| `pnpm check` | Verifica tipos TypeScript |
| `pnpm db:push` | Aplica migracoes do banco |

## Classificacao de Risco (IRQ)

O calculo usa parametros dendrometricos para gerar um indice normalizado de 0 a 100:

| Faixa | Classificacao | Cor |
|-------|--------------|-----|
| 0-25 | Risco Muito Baixo | Azul |
| 26-50 | Risco Baixo | Verde |
| 51-75 | Alerta - Monitorar | Laranja |
| 76-100 | Alerta - Supressao | Vermelho |

**Parametros:** Diametro da copa, Altura geral, Altura de ramificacao, DAP, Diametro do colo, Angulo de inclinacao, Colo diagnosticado, Ramificacao em V, Corpo de frutificacao.

## API

| Rota | Metodo | Descricao |
|------|--------|-----------|
| `/painel` | GET | Painel administrativo web |
| `/api/health` | GET | Health check |
| `/api/kmz` | GET | Download do arquivo KMZ |
| `/api/relatorio` | POST | Gerar relatorio Word (.docx) |
| `/api/upload?pasta=arvores` | POST | Upload de foto de arvore |
| `/api/upload?pasta=regioes` | POST | Upload de foto de regiao |
| `/api/trpc/arvores.listar` | GET | Listar todas as arvores |
| `/api/trpc/arvores.sincronizar` | POST | Criar/atualizar arvore |
| `/api/trpc/arvores.deletar` | POST | Excluir arvore |
| `/api/trpc/regioes.listar` | GET | Listar todas as regioes |
| `/api/trpc/regioes.sincronizar` | POST | Criar/atualizar regiao |
| `/api/trpc/regioes.deletar` | POST | Excluir regiao |

## Docker

A aplicacao usa **multi-stage build** para manter a imagem de producao leve (~546MB):

- **Stage 1 (builder):** Instala dependencias, compila TypeScript com esbuild
- **Stage 2 (runtime):** Apenas dependencias de producao + `dist/index.js`

**Volumes persistentes:**
- `./uploads` — Fotos de arvores e regioes (bind mount)
- `mysql_data` — Dados do MySQL (Docker volume)

**Health checks:**
- MySQL: `mysqladmin ping` a cada 10s
- Server: `GET /api/health` a cada 30s
