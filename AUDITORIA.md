# Auditoria Técnica — Risco de Queda de Árvore
**Data:** 15/03/2026 | **Checkpoint atual:** `53de7b7a` | **Testes:** 109 passando, 0 erros TypeScript

---

## 1. Visão Geral da Arquitetura

O sistema é composto por três camadas que se comunicam de forma bem definida:

| Camada | Tecnologia | Responsabilidade |
|---|---|---|
| **App Mobile** | React Native (Expo SDK 54), TypeScript | Cadastro offline de árvores, cálculo IRQ, mapa nativo, sync automático |
| **Backend** | Node.js + Express + tRPC + Drizzle ORM + MySQL 8.0 | API REST/tRPC, upload de fotos (multer), geração KMZ, painel web |
| **Painel Web** | HTML autocontido servido em `/painel` | Visualização administrativa com Google Maps JS API |

A arquitetura é **offline-first**: o app armazena tudo em AsyncStorage e sincroniza automaticamente ao detectar retorno de conexão via `expo-network`.

---

## 2. O Que Está Implementado e Funcionando

### 2.1 App Mobile (`app/(tabs)/`)

**Tela Calculadora (`index.tsx`)** — Totalmente funcional.

Todos os campos exigidos pelo escopo estão presentes e operacionais:

| Campo | Tipo | Status |
|---|---|---|
| Diâmetro da copa | Numérico | ✅ |
| Altura geral | Numérico | ✅ |
| Altura 1ª ramificação | Numérico | ✅ |
| DAP | Numérico | ✅ |
| DCOLO | Numérico | ✅ |
| Ângulo de inclinação | Numérico | ✅ |
| Colo diagnosticado | Numérico | ✅ |
| Ramificação em V | Checkbox | ✅ |
| Corpo de frutificação | Checkbox | ✅ |

A fórmula IRQ implementada em `lib/irq.ts` e `mapa.native.tsx` é:

```
areaCopa = DC² × (π/4)
volumeCopa = areaCopa × 0.5 × (alturaGeral − alturaRamificacao)
fatorDap = (DAP / DCOLO) × anguloInclinacao
IRQ = volumeCopa × fatorDap + coloDiag × 800 + ramificacaoV × (−800) + corpoFrutificacao × (−800)
```

A classificação de risco (`classifyRisk`) usa os limiares: IRQ < 0 → Baixo, ≤ 5.000 → Moderado, ≤ 15.000 → Alto, > 15.000 → Muito Alto.

**Tela Mapa (`mapa.native.tsx`)** — Totalmente funcional.

- Marcadores coloridos por nível de risco (verde/amarelo/laranja/vermelho)
- Modal de cadastro de árvore com foto (câmera ou galeria)
- Modal de cadastro de região com polígono desenhado tocando no mapa
- Painel de detalhes ao tocar em marcador ou polígono
- Botão "Exportar KMZ" com `expo-sharing`
- Badge de status de sync com contador de pendentes e botão de retry manual
- Modo de desenho de polígono com preview em tempo real

### 2.2 Sincronização Offline-First (`hooks/use-network-sync.ts` + `lib/sync.ts`)

| Funcionalidade | Status |
|---|---|
| Detecção de rede via `expo-network` | ✅ |
| Fila de pendentes no AsyncStorage | ✅ |
| Sync automático ao retornar conexão | ✅ |
| Upload de foto via `POST /api/upload` (multer/FormData) | ✅ |
| **G1: Limpeza de foto local após upload confirmado** | ✅ `FileSystem.deleteAsync(uri, { idempotent: true })` |
| Marcação de item como pendente em caso de falha | ✅ |

### 2.3 Notificações Locais (`lib/notifications.ts`)

| Funcionalidade | Status |
|---|---|
| Canal Android LOW (sync bem-sucedido, sem som) | ✅ |
| Canal Android DEFAULT (sync parcial, vibração curta) | ✅ |
| `notificarSyncConcluido` — mensagem singular/plural | ✅ |
| `notificarSyncParcial` — identifier fixo anti-spam | ✅ |
| Deep link para `/(tabs)/mapa` via `data.url` | ✅ |
| Listener no `_layout.tsx` com `router.replace` | ✅ |
| Permissão solicitada silenciosamente no startup | ✅ |

### 2.4 Backend (`server/`)

| Rota | Método | Função | Status |
|---|---|---|---|
| `/api/trpc/arvores.listar` | GET | Lista todas as árvores do MySQL | ✅ |
| `/api/trpc/arvores.sincronizar` | POST | Upsert de árvore (cria ou atualiza) | ✅ |
| `/api/trpc/arvores.deletar` | POST | Remove árvore por `localId` | ✅ |
| `/api/trpc/regioes.listar` | GET | Lista todas as regiões do MySQL | ✅ |
| `/api/trpc/regioes.sincronizar` | POST | Upsert de região com polígono JSON | ✅ |
| `/api/trpc/regioes.deletar` | POST | Remove região por `localId` | ✅ |
| `POST /api/upload?pasta=arvores` | POST | Recebe foto via multer, salva em `/uploads` | ✅ |
| `GET /uploads/:pasta/:filename` | GET | Serve foto salva localmente | ✅ |
| `GET /api/kmz` | GET | Gera e baixa arquivo `.kmz` com fotos | ✅ |
| `GET /painel` | GET | Serve painel HTML com chave e URL base injetadas | ✅ |
| `GET /api/health` | GET | Health check | ✅ |

### 2.5 Banco de Dados (MySQL 8.0 + Drizzle ORM)

Três tabelas com migrations versionadas (`drizzle/0000`, `0001`, `0002`):

| Tabela | Colunas relevantes | Observação |
|---|---|---|
| `users` | `openId`, `role`, `lastSignedIn` | Padrão do template |
| `arvores` | `localId`, `nomeCientifico`, `fotoUrl`, `latitude`, `longitude`, `irqValor`, `irqClassificacao`, `irqParametros`, `pinColor` | `irqParametros` armazena JSON dos campos do formulário |
| `regioes` | `localId`, `titulo`, `fotoUrl`, `coordenadas` (JSON nativo), `centroLat`, `centroLng` | `coordenadas` migrada de TEXT para JSON nativo na migration 0002 |

### 2.6 Painel Web (`server/painel.html`)

- Google Maps JS API com marcadores coloridos por risco
- Polígonos de regiões semitransparentes
- Sidebar com filtros por nível de risco (Todos / Alto / Moderado / Baixo)
- Cards de árvores e regiões com foto, IRQ e coordenadas
- Info windows ao clicar em marcador
- Auto-refresh a cada 60 segundos
- Botão de download KMZ
- URL base injetada pelo servidor com 4 fallbacks (proxy reverso → host direto → `PUBLIC_URL` → localhost)

### 2.7 Configuração e Segurança

- `EXPO_PUBLIC_GOOGLE_MAPS_MOBILE_KEY` — chave restrita por bundle ID (iOS/Android)
- `GOOGLE_MAPS_API_KEY` — chave restrita por domínio (painel web)
- `app.config.ts` com `userInterfaceStyle: "light"` e `newArchEnabled: false`
- Permissões declaradas: `POST_NOTIFICATIONS`, `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`, câmera, galeria

---

## 3. O Que Está Pendente (Backlog)

### 3.1 Pendente — Antes do Deploy em Produção

| Item | Prioridade | Descrição |
|---|---|---|
| **Refatoração snake_case** | Alta | Migrar colunas `localId`, `fotoUrl`, `irqValor`, `irqClassificacao`, `irqParametros`, `pinColor`, `nomeCientifico`, `centroLat`, `centroLng` para snake_case com uma migration SQL única. Fazer enquanto o banco ainda está vazio. |

### 3.2 Pendente — Melhorias de UX

| Item | Prioridade | Descrição |
|---|---|---|
| **Tela de Pendências** | Média | Sheet modal listando itens na fila do AsyncStorage com retry manual por item. Tornaria o deep link da notificação parcial mais útil do que o badge genérico atual. |
| **Paginação no endpoint `listar`** | Baixa | Adicionar `limit`/`offset` na query tRPC quando o banco crescer acima de ~500 registros. |

### 3.3 Pendente — Validação em Dispositivo Real

| Item | Descrição |
|---|---|
| **Gerar APK via botão Publish** | Validar notificações locais, chaves Google Maps e comportamento offline em dispositivo físico. |
| **Testar KMZ com foto** | Cadastrar árvore com foto pelo app, sincronizar e baixar KMZ pelo painel para confirmar imagem no Google Earth. |

---

## 4. Pontos de Atenção Técnica

### 4.1 `irqParametros` não exibido no painel nem no KMZ

O campo `irqParametros` (JSON com os valores do formulário) é salvo no banco mas não é exibido no painel web nem incluído na descrição do KMZ. Se o objetivo for permitir auditoria dos parâmetros de cálculo, isso precisa ser adicionado.

### 4.2 `latitude`/`longitude` retornam como string do MySQL

Colunas `DECIMAL` no MySQL retornam como `string` no JavaScript. O app usa `parseFloat` corretamente ao exibir coordenadas. O painel web também usa `parseFloat` antes de passar para o Google Maps. Não há bug, mas é um comportamento que precisa ser mantido em qualquer código novo que tocar nessas colunas.

### 4.3 `irqParametros` armazenado como `text` (JSON serializado manualmente)

O campo é salvo como `JSON.stringify(irqForm)` no app e armazenado como `text` no banco. Não há validação de schema no servidor. Se o formato do formulário mudar, registros antigos terão JSON incompatível. Considerar migrar para `json()` do Drizzle como foi feito com `coordenadas`.

### 4.4 Fotos salvas localmente em `/uploads`

As fotos são salvas no servidor em disco local (`/uploads/arvores/`, `/uploads/regioes/`). Em produção com múltiplas instâncias ou reinicialização do container, as fotos serão perdidas. Para produção real, migrar para S3 ou armazenamento persistente.

### 4.5 Autenticação ausente nas rotas de árvores e regiões

Todas as rotas tRPC usam `publicProcedure` — qualquer pessoa com acesso à URL do servidor pode criar, editar ou deletar registros. Para produção, adicionar autenticação nas rotas de escrita.

---

## 5. Resumo Executivo

O projeto está **funcionalmente completo** para o escopo definido. Todos os requisitos do usuário estão implementados: formulário IRQ com todos os campos, funcionamento offline, sincronização automática com limpeza de foto local (G1), exportação KMZ, painel web administrativo, notificações discretas de sync e chaves Google Maps separadas por plataforma.

O próximo passo crítico antes de gerar o APK de produção é decidir sobre a **refatoração snake_case** (item 3.1), pois é uma mudança de schema que deve ser feita com o banco ainda vazio. Após isso, o fluxo de publicação é: configurar as chaves Google Maps via painel de Secrets → criar checkpoint → clicar em Publish.
