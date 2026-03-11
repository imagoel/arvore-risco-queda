# Design — Índice de Risco de Queda de Árvore

## Conceito Visual

Aplicativo técnico para arboristas e profissionais de gestão de árvores urbanas. Visual limpo, profissional e funcional, com identidade visual ligada à natureza (verde floresta) e à precisão técnica.

## Paleta de Cores

| Token       | Light                | Dark                 | Uso                        |
|-------------|----------------------|----------------------|----------------------------|
| primary     | `#2D6A4F` (verde)    | `#52B788` (verde claro) | Botões, destaques         |
| background  | `#F8FAF9`            | `#0F1A14`            | Fundo das telas            |
| surface     | `#FFFFFF`            | `#1A2E22`            | Cards, formulários         |
| foreground  | `#1A2E22`            | `#D8F3DC`            | Texto principal            |
| muted       | `#52796F`            | `#74C69D`            | Texto secundário, labels   |
| border      | `#B7E4C7`            | `#2D6A4F`            | Bordas, divisores          |
| success     | `#1B4332`            | `#52B788`            | Risco baixo                |
| warning     | `#D4A017`            | `#FBBF24`            | Risco médio                |
| error       | `#C1121F`            | `#F87171`            | Risco alto                 |

## Lista de Telas

### 1. Tela Principal — Calculadora de Risco
Única tela do aplicativo (sem tabs desnecessárias). Contém:
- Cabeçalho com logo e título do app
- Formulário com todos os campos de entrada
- Botão "Calcular Risco"
- Card de resultado com índice e classificação de risco

## Campos do Formulário

| Campo                    | Tipo         | Unidade  |
|--------------------------|--------------|----------|
| Diâmetro da Copa         | Numérico     | metros   |
| Altura Geral             | Numérico     | metros   |
| Altura da 1ª Ramificação | Numérico     | metros   |
| DAP                      | Numérico     | cm       |
| DCOLO                    | Numérico     | cm       |
| Ângulo de Inclinação     | Numérico     | graus    |
| Colo Diagnóstico 1       | Numérico     | —        |
| Colo Diagnóstico 2       | Numérico     | —        |
| Colo Diagnóstico 3       | Numérico     | —        |
| Ramificação em V         | Checkbox     | —        |
| Corpo de Frutificação    | Checkbox     | —        |

## Fórmula

```
IRQ = (((DiametroCopa * DiametroCopa * (3.1416/4)) * 0.5) * (AlturaGeral - AlturaRamificacao))
      * ((DAP / DCOLO) * AnguloInclinacao * 1)
      + ((ColoDiag1 + ColoDiag2 + ColoDiag3) * 800)
      + (RamificacaoV * (-800))
      + (CorpoFrutificacao * (-800))
```

## Classificação de Risco

| Faixa do IRQ  | Classificação  | Cor       |
|---------------|----------------|-----------|
| < 0           | Baixo          | Verde     |
| 0 – 5000      | Moderado       | Amarelo   |
| 5001 – 15000  | Alto           | Laranja   |
| > 15000       | Muito Alto     | Vermelho  |

## Fluxo Principal

1. Usuário abre o app → Tela de calculadora
2. Preenche os campos numéricos
3. Marca/desmarca os checkboxes
4. Toca em "Calcular Risco"
5. Card de resultado aparece com o índice e a classificação colorida
6. Usuário pode limpar e recalcular

## Layout

- ScrollView vertical para acomodar todos os campos
- Campos agrupados em cards por categoria
- Checkboxes com visual claro de marcado/desmarcado
- Resultado em destaque no final da tela
- Botões com feedback tátil (haptics)
