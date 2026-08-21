# Plano de Implementação: Obrigações PF (Pessoa Física)

O objetivo é criar uma nova área centralizada para gestão de obrigações pessoais (PF), integrada ao sistema de tarefas e banco de dados, permitindo categorização múltipla, recorrência e histórico de comprovantes.

## Alterações Técnicas

### Banco de Dados (Já executado)
- Coluna `is_personal` adicionada em `property_obligations`.
- Coluna `property_id` tornada opcional.
- Restrição `kind` expandida (IRPF, ITR, INSS, etc).
- Criada tabela `property_obligation_categories` para suporte a múltiplas categorias.

### Frontend e Lógica
1.  **Sidebar**: Adicionar "Obrigações PF" no `AppShell`.
2.  **Gestor de Obrigações PF**: Criar `src/components/obligations-pf-manager.tsx`.
    - Reaproveitar componentes de UI (`Dialog`, `Select`, `Input`, `Card`).
    - Implementar formulário com: Nome, Categorias (múltipla seleção), Vencimento, Periodicidade, Dados de Acesso (Link, Login, Senha segura) e Vínculo opcional com Imóvel.
    - Integração com Tarefas: Criação automática de tarefas ao salvar uma obrigação com vencimento.
3.  **Seleção de Categorias**: Criar um seletor multi-item para categorias.
4.  **Rota**: Criar `src/routes/_authenticated/app.personal-obligations.tsx`.
5.  **Tarefas**: Garantir que o envio de comprovante na tarefa vincule corretamente o arquivo à obrigação PF original.

## Experiência do Usuário
- O usuário terá uma visão clara de todas as obrigações pessoais.
- Acesso rápido aos sites de serviços com cópia segura de credenciais.
- Controle rigoroso de prazos através da integração nativa com o módulo de Tarefas.
- Histórico completo de pagamentos e comprovantes.
