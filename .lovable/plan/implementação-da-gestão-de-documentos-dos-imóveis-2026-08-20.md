# Implementação da Gestão de Documentos dos Imóveis

Este plano descreve a implementação completa da aba "Documentos" no hub administrativo de propriedades, incluindo armazenamento, metadados e visualização.

## Mudanças Técnicas
- **Banco de Dados**: Criação da tabela `property_documents` para metadados e `property_document_links` para permitir o compartilhamento de um documento entre múltiplos imóveis (N:N).
- **Armazenamento**: Criação de um bucket privado `property_documents` no storage para arquivos PDF, Word e imagens.
- **Funções de Servidor**: Implementação de lógica para gerar URLs assinadas (seguras), salvar metadados e gerenciar vínculos entre documentos e imóveis.
- **Interface**:
  - Nova aba `DocumentsTab` em `src/components/property-tabs.tsx`.
  - Formulário de upload com seleção de categoria e notas.
  - Lista de documentos com busca e filtros.
  - Visualizador interno para PDFs e imagens usando URLs assinadas.
- **Segurança**: Políticas RLS estritas garantindo isolamento por perfil e usuário.

## Passos da Implementação
1. **Infraestrutura**: Configurar tabelas e bucket de storage (via ferramentas Supabase).
2. **Backend**: Criar `src/lib/documents.functions.ts` com as server functions necessárias.
3. **Componentes**: Desenvolver o componente de visualização e listagem em `src/components/property-tabs.tsx`.
4. **Integração**: Conectar a nova aba ao roteador da propriedade em `src/routes/_authenticated/app.properties.$id.tsx`.
5. **Validação**: Testar fluxos de upload, compartilhamento entre imóveis e visualização segura.
