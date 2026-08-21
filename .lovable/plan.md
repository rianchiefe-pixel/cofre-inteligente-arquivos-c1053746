# Plano de Implementação: Alternância de Visualização (Grade/Lista)

Implementar o controle de visualização em Grade (Cards) e Lista (Linhas) nas telas de **Acessos** e **Imóveis**, permitindo uma visualização mais compacta e eficiente dos registros, preservando todas as funcionalidades de busca, filtro e edição.

## Alterações

### 1. Componente `AccessesManager` (`src/components/accesses-manager.tsx`)
- Adicionar estado `viewMode` ('grid' | 'list') persistido no `localStorage`.
- Incluir botões de alternância (ícones `LayoutGrid` e `List`) ao lado dos filtros.
- Implementar a renderização condicional:
    - **Grade**: Manter o layout de cards atual.
    - **Lista**: Criar uma tabela ou lista de linhas compactas contendo:
        - Nome do serviço, Login (com botão copiar), Senha (mascarada, com botões revelar/copiar).
        - Badges dos imóveis vinculados.
        - Botões de ação rápida (Abrir link, Editar, Excluir).

### 2. Tela de Imóveis (`src/routes/_authenticated/app.properties.index.tsx`)
- Adicionar estado `viewMode` ('grid' | 'list') persistido no `localStorage`.
- Incluir botões de alternância na barra de ferramentas superior.
- Implementar a renderização condicional:
    - **Grade**: Manter o layout de cards atual.
    - **Lista**: Criar uma tabela ou lista de linhas compactas contendo:
        - Nome do imóvel, Tipo, Status (Badge), Gasto e Investido.
        - Botões de ação rápida (Ver detalhes, Editar, Arquivar, Excluir).

## Detalhes Técnicos
- Utilizar `lucide-react` para os ícones de visualização (`LayoutGrid`, `List`).
- Garantir responsividade: no modo lista, ocultar colunas menos essenciais em telas pequenas ou converter para um formato de linha empilhada.
- O estado de visualização deve ser salvo individualmente para cada tela no `localStorage` (ex: `accesses-view-mode`, `properties-view-mode`).

## Verificação
- Alternar entre modos em ambas as telas e validar se os filtros e buscas permanecem ativos.
- Testar ações (editar, copiar, excluir) no modo lista.
- Validar persistência ao atualizar a página.
