# Relatório de Alinhamento Arquitetural

**Projeto:** Índice de Risco de Queda de Árvore  
**Data:** 15/03/2026  
**Referência:** Arquitetura Oficial do Sistema (Versão MySQL)

---

## Resumo Executivo

O projeto está **amplamente alinhado** com a arquitetura oficial. Os pilares centrais (MySQL, Node.js com multer, app offline-first, geração de KMZ) estão implementados e funcionais. Existem **3 gaps** a resolver: precisão das colunas de coordenadas, tipo da coluna de polígonos e dois componentes ausentes (limpeza de fotos locais pós-sync e painel web administrativo).

---

## 1. Banco de Dados (MySQL 8.0)

| Requisito Oficial | Status | Detalhe |
|---|---|---|
| MySQL 8.0 via Docker | ✅ Implementado | `drizzle-orm/mysql2`, `DATABASE_URL` configurado |
| Latitude/Longitude em `DECIMAL(10, 8)` | ⚠️ Divergência menor | Schema usa `DECIMAL(10, 7)` — 7 casas decimais em vez de 8. Precisão de ~1,1 cm vs ~0,11 mm. Funcional, mas não exatamente conforme especificado |
| Polígonos em coluna `JSON` | ⚠️ Divergência menor | Coluna `coordenadas` declarada como `text()` no Drizzle, não `json()`. O MySQL armazena como `TEXT` em vez de `JSON` nativo. Os dados são serializados corretamente, mas perde-se a validação e indexação JSON do MySQL |
| `fotoUrl` armazena apenas o caminho relativo | ✅ Implementado | Ex: `/uploads/arvores/abc123.jpg` |

---

## 2. Servidor Central (Node.js)

| Requisito Oficial | Status | Detalhe |
|---|---|---|
| Upload com multer → pasta `/uploads` | ✅ Implementado | `server/upload-local.ts`: `POST /api/upload?pasta=arvores` salva em `uploads/arvores/` |
| Servir fotos via `GET /uploads/:pasta/:filename` | ✅ Implementado | Rota `app.use("/uploads", ...)` em `upload-local.ts` |
| Geração de KMZ: busca MySQL → formata KML → copia fotos → compacta | ✅ Implementado | `server/kmz.ts`: usa `archiver`, formata XML manualmente, inclui fotos locais |
| Rota `GET /api/kmz` | ✅ Implementado | `server/_core/index.ts` linha 63 |
| CRUD de árvores via tRPC | ✅ Implementado | `server/routers.ts`: `arvores.sincronizar`, `arvores.listar`, `arvores.deletar` |
| CRUD de regiões via tRPC | ✅ Implementado | `server/routers.ts`: `regioes.sincronizar`, `regioes.listar`, `regioes.deletar` |

---

## 3. Aplicativo Mobile (React Native)

| Requisito Oficial | Status | Detalhe |
|---|---|---|
| Google Maps SDK nativo | ✅ Implementado | `react-native-maps` com `PROVIDER_GOOGLE` |
| Offline-First: salva localmente sem internet | ✅ Implementado | `AsyncStorage` com chaves `@arvore_marcadores_v3` e `@arvore_regioes_v1` |
| Detecta retorno do 4G e sincroniza | ✅ Implementado | `hooks/use-network-sync.ts` com `expo-network` |
| Fila de pendentes no AsyncStorage | ✅ Implementado | `@sync_pending_trees` e `@sync_pending_regions` |
| **Apaga foto local do celular após sync bem-sucedido** | ❌ **Ausente** | `lib/sync.ts` envia a foto mas **não deleta o arquivo local** com `expo-file-system`. Isso vai acumulando fotos no dispositivo |
| Botão de download KMZ no app | ❌ **Ausente** | Não há botão no mapa para acionar `GET /api/kmz` e compartilhar o arquivo |

---

## 4. Painel Administrativo Web (React)

| Requisito Oficial | Status | Detalhe |
|---|---|---|
| Interface web com Google Maps JS API | ❌ **Ausente** | Não existe painel web. O projeto tem apenas o app mobile e o servidor |
| Consumir `GET /api/trpc/arvores.listar` e `regioes.listar` | ❌ **Ausente** | Endpoints existem no servidor, mas não há frontend web que os consuma |
| Desenhar pinos e polígonos no mapa web | ❌ **Ausente** | Dependente do painel web acima |

---

## 5. Fluxo Passo a Passo (Validação)

| Passo | Requisito | Status |
|---|---|---|
| Passo 1 | Coleta offline: marca árvore, preenche dados, tira foto → salva no celular | ✅ |
| Passo 2a | App detecta conexão e envia pacote ao Node.js | ✅ |
| Passo 2b | App apaga foto pesada da galeria após sync | ❌ Ausente |
| Passo 3 | Node.js salva foto em `/uploads`, executa `INSERT` no MySQL | ✅ |
| Passo 4 | Painel web faz `GET`, Node.js faz `SELECT`, mapa desenha pontos | ❌ Painel ausente |
| Passo 5 | Botão "Baixar KMZ" → Node.js gera e envia `.kmz` | ✅ (rota existe, botão no app ausente) |

---

## Gaps Identificados e Prioridade

| # | Gap | Impacto | Esforço |
|---|---|---|---|
| G1 | Limpeza de foto local após sync (`expo-file-system`) | Alto — acumula espaço no dispositivo | Baixo |
| G2 | Botão "Baixar KMZ" no app mobile | Médio — funcionalidade de exportação inacessível pelo celular | Baixo |
| G3 | Painel web administrativo (React + Google Maps JS) | Alto — sem interface de gestão no escritório | Alto |
| G4 | Coluna `coordenadas` como `json()` em vez de `text()` | Baixo — funcional, mas não conforme spec | Médio (requer migration) |
| G5 | Precisão `DECIMAL(10, 8)` em vez de `(10, 7)` | Baixo — diferença de 1 casa decimal | Médio (requer migration) |

---

## Conclusão

**O que está 100% alinhado:** toda a stack de backend (MySQL, multer, tRPC, KMZ), o app offline-first com sync automático e a detecção de rede. **O que falta:** a limpeza de fotos locais pós-sync (G1, crítico para o dispositivo), o botão de download KMZ no celular (G2) e o painel web administrativo (G3, o componente mais complexo ainda não iniciado).
