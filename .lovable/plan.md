# Plan: Implementação de Gestão de Documentos em Imóveis

Implementar uma funcionalidade completa de gerenciamento de documentos para imóveis, permitindo upload, visualização interna (PDF e Imagens), download e compartilhamento entre imóveis do mesmo perfil.

## User Review Required

> [!IMPORTANT]
> A implementação usará o Supabase Storage para armazenar os arquivos e novas tabelas no banco de dados para os metadados e vínculos. O compartilhamento entre imóveis será feito via uma tabela de ligação (N:N), evitando a duplicidade de arquivos físicos.

## Proposed Changes

### Database & Storage
- Criar bucket `property_documents` no Supabase Storage.
- Criar tabela `property_documents` para metadados (título, categoria, tipo, tamanho, notas).
- Criar tabela `property_document_links` para gerenciar o vínculo entre documentos e imóveis (N:N).
- Implementar políticas de RLS para garantir que usuários acessem apenas seus próprios documentos.

### Backend Functions
- Criar `src/lib/documents.functions.ts` com funções para:
    - `savePropertyDocument`: Salvar metadados e criar vínculos iniciais.
    - `linkDocumentToProperties`: Atualizar os vínculos de compartilhamento.
    - `deletePropertyDocument`: Remover documento e seus arquivos físicos.
    - `getSignedUrl`: Obter URL temporária para visualização/download seguro.

### UI Components
- **DocumentsTab**: Nova aba no detalhe do imóvel.
    - Lista de documentos com busca e filtros.
    - Diálogo de Upload com suporte a arrastar e soltar.
    - Diálogo de Compartilhamento.
- **DocumentViewer**: Visualizador interno integrado.
    - Suporte a PDF com controles (zoom, navegação, download).
    - Suporte a Imagens (zoom, fechar).
    - Fallback de download para outros formatos.

### Route Integration
- Atualizar a aba "Documentos" em `src/routes/_authenticated/app.properties.$id.tsx` para renderizar o `DocumentsTab`.

## Technical Details
- **Storage Path**: `/user_id/documents/filename`.
- **N:N Sharing**: A tabela `property_document_links` permite que um `document_id` esteja associado a múltiplos `property_id`.
- **PDF Viewer**: Utilizaremos uma implementação baseada em `iframe` ou objeto nativo com controles customizados em React, ou uma biblioteca leve se necessário para atender aos requisitos de zoom/navegação.

## Verification Plan
1. **Upload**: Testar envio de PDF, JPG e PNG.
2. **Persistência**: Verificar registros no banco e arquivo no storage.
3. **Visualização**: Abrir PDF e Imagem no visualizador interno.
4. **Compartilhamento**: Vincular documento a dois imóveis e verificar se aparece em ambos.
5. **Exclusão**: Remover documento e garantir que o arquivo e os vínculos sumiram.
