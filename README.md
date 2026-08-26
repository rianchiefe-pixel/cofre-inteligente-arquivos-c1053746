# Cofre Inteligente

Crie um sistema web responsivo para computador e celular chamado Meu Cofre.

O objetivo do sistema é ajudar pessoas físicas, empresas, holdings familiares e gestores de imóveis a organizar comprovantes, despesas, investimentos e movimentações financeiras de forma prática, segura e visual.

O sistema não deve ter foco em cálculo de receitas ou faturamento. O foco principal será em:

armazenamento de comprovantes;

organização de gastos;

controle de despesas;

controle de investimentos;

separação por bancos, contas, categorias e perfis;

geração de relatórios financeiros;

análise automática de comprovantes;

prevenção de comprovantes duplicados.

Identidade do sistema

Nome do sistema: Meu Cofre

Crie uma interface moderna, limpa, segura e profissional, transmitindo confiança, organização e controle financeiro.

O design deve lembrar um sistema de gestão patrimonial, com aparência premium, mas simples de usar.

Use uma paleta visual elegante, com tons como azul escuro, branco, cinza claro, verde suave e detalhes em dourado ou azul vibrante.

O sistema deve permitir personalização com logo, nome da empresa, nome do perfil e identidade visual do usuário.

Público-alvo

O sistema será usado por:

pessoas físicas que possuem várias contas bancárias;

famílias que precisam organizar despesas pessoais;

empresários;

holdings familiares;

gestores de imóveis;

pessoas que administram várias contas, cartões, bancos e comprovantes;

escritórios ou responsáveis pela organização financeira de terceiros.

Estrutura principal do sistema

O usuário deve poder criar uma conta e, dentro dela, criar diferentes perfis financeiros.

Exemplo:

Perfil pessoal;

Perfil da empresa;

Perfil da holding;

Perfil de um imóvel específico;

Perfil de um familiar;

Perfil de uma fazenda;

Perfil de um projeto;

Perfil de uma conta jurídica.

Cada perfil deve ter seus próprios bancos, contas, cartões, categorias, comprovantes, despesas e relatórios.

O usuário também poderá visualizar um relatório consolidado juntando todos os perfis.

Perfis financeiros

Criar uma área chamada Perfis.

Cada perfil deve permitir:

nome do perfil;

tipo do perfil: pessoa física, empresa, holding, imóvel, projeto ou outro;

CPF ou CNPJ, opcional;

logo ou imagem do perfil;

cor personalizada;

observações;

status ativo ou arquivado.

O sistema deve permitir alternar rapidamente entre perfis.

Também deve existir a opção Ver tudo junto, mostrando o consolidado de todos os perfis.

Bancos e contas

Dentro de cada perfil, o usuário poderá cadastrar vários bancos e contas.

Campos para banco/conta:

nome do banco;

tipo de conta: corrente, poupança, PJ, investimento, cartão, carteira digital ou outro;

apelido da conta;

titular;

agência, opcional;

número da conta, opcional;

cor de identificação;

saldo inicial, opcional;

observações.

O sistema deve permitir visualizar:

gasto total por banco;

gasto total por conta;

gasto por dia;

gasto por mês;

gasto por categoria;

gasto por perfil;

todos os bancos juntos;

todos os perfis juntos.

Cartões

Criar uma área para cadastro de cartões.

Campos:

nome do cartão;

banco vinculado;

bandeira;

final do cartão;

limite, opcional;

dia de fechamento;

dia de vencimento;

titular;

perfil vinculado.

As despesas podem ser lançadas como:

débito;

crédito à vista;

crédito parcelado;

Pix;

TED;

boleto;

dinheiro;

transferência;

outro.

Comprovantes

Essa é a função principal do sistema.

Criar uma área chamada Cofre de Comprovantes.

O usuário poderá enviar comprovantes em:

PDF;

imagem JPG;

imagem PNG;

print de tela;

arquivo digitalizado.

O sistema deve permitir upload individual ou upload em lote.

Exemplo: o usuário tem 40 comprovantes em uma pasta e sobe todos de uma vez.

Após o upload, o sistema deve analisar automaticamente os comprovantes usando OCR e inteligência artificial.

O sistema deve tentar identificar:

data do pagamento;

valor;

banco de origem;

destinatário;

CPF ou CNPJ do destinatário, se existir;

tipo de pagamento;

código de autenticação;

descrição;

categoria provável;

perfil relacionado;

conta relacionada;

se é despesa, investimento ou gasto pessoal;

se é pagamento fixo ou variável.

Após a análise, o sistema deve exibir uma tela de conferência.

O usuário deve aprovar, editar ou rejeitar cada lançamento antes de salvar definitivamente.

Detecção de comprovantes repetidos

O sistema deve ter uma função forte de prevenção contra comprovantes duplicados.

Ao subir um comprovante, o sistema deve comparar com os comprovantes já existentes.

Critérios de comparação:

valor;

data;

destinatário;

CPF ou CNPJ;

banco;

código de autenticação;

descrição;

imagem parecida;

hash do arquivo;

horário aproximado;

conta de origem.

Se houver suspeita de duplicidade, o sistema deve mostrar um alerta:

“Possível comprovante repetido encontrado.”

Mostrar lado a lado:

comprovante novo;

comprovante já existente;

valor;

data;

destinatário;

categoria;

perfil;

banco;

conta.

O usuário poderá escolher:

confirmar como novo;

marcar como duplicado;

substituir comprovante antigo;

cancelar envio.

Reconhecimento inteligente de destinatários

O sistema deve aprender com o histórico.

Exemplo:

Se o usuário já cadastrou um pagamento para “Condomínio Edifício X” como categoria “Condomínio”, na próxima vez que aparecer o mesmo destinatário, o sistema deve sugerir automaticamente a mesma categoria.

O sistema deve criar uma base de destinatários recorrentes.

Campos do destinatário:

nome;

CPF/CNPJ;

categoria padrão;

tipo padrão: despesa, investimento ou custo fixo;

perfil mais usado;

banco mais usado;

observações.

Quando aparecer um novo destinatário, o sistema deve permitir cadastrar pela primeira vez.

Quando aparecer um destinatário já conhecido, o sistema deve sugerir automaticamente:

categoria;

tipo de despesa;

perfil;

conta;

recorrência;

observações.

Categorias

Criar categorias e subcategorias.

Categorias principais sugeridas:

Imóveis;

Condomínio;

Energia;

Água;

Internet;

IPTU;

Cartório;

Reforma;

Material de construção;

Mão de obra;

Compra de imóvel;

Taxas administrativas;

Honorários;

Contabilidade;

Jurídico;

Educação;

Saúde;

Transporte;

Alimentação;

Mercado;

Assinaturas;

Cartão de crédito;

Investimentos;

Despesas pessoais;

Despesas empresariais;

Impostos;

Outros.

O usuário deve poder criar, editar, excluir ou arquivar categorias.

Cada categoria poderá ser marcada como:

gasto fixo;

gasto variável;

investimento;

despesa operacional;

despesa pessoal;

despesa empresarial;

despesa patrimonial.

Investimentos e despesas

O sistema deve separar claramente:

despesas;

gastos fixos;

gastos variáveis;

investimentos;

gastos pessoais;

gastos empresariais;

gastos patrimoniais.

Exemplo:

Compra de imóvel: investimento.

Condomínio: despesa fixa.

Conta de energia: despesa variável.

Cartório: investimento ou despesa patrimonial.

Material de construção: investimento ou manutenção, conforme escolha do usuário.

O sistema deve permitir alterar a classificação manualmente.

Painel inicial

Criar um dashboard inicial com visão geral.

Cards principais:

total gasto no mês;

total investido no mês;

total de despesas fixas;

total de despesas variáveis;

total por banco;

total por perfil;

total por categoria;

total de comprovantes armazenados;

comprovantes pendentes de conferência;

possíveis comprovantes duplicados;

maiores gastos do mês;

gastos de hoje;

gastos dos últimos 7 dias;

gastos por cartão;

gastos por conta.

Gráficos:

gráfico de gastos por categoria;

gráfico de gastos por banco;

gráfico de gastos por perfil;

gráfico mensal;

gráfico diário;

gráfico de despesas fixas x variáveis;

gráfico de investimentos x despesas;

ranking dos maiores destinatários;

evolução dos gastos ao longo do tempo.

Relatórios

Criar uma área chamada Relatórios.

Tipos de relatório:

Relatório geral de gastos;

Relatório por banco;

Relatório por conta;

Relatório por cartão;

Relatório por perfil;

Relatório por categoria;

Relatório por imóvel;

Relatório de investimentos;

Relatório de despesas fixas;

Relatório de despesas variáveis;

Relatório de comprovantes armazenados;

Relatório de possíveis duplicidades;

Relatório consolidado de todos os perfis;

Relatório mensal;

Relatório anual;

Relatório personalizado por período.

Filtros dos relatórios:

período;

perfil;

banco;

conta;

cartão;

categoria;

destinatário;

tipo de gasto;

valor mínimo;

valor máximo;

status do comprovante;

despesa fixa ou variável;

investimento ou despesa.

Os relatórios devem poder ser exportados em:

PDF;

Excel;

CSV.

O relatório em PDF deve ter aparência profissional, com capa, logo, período analisado, resumo, gráficos e lista detalhada.

Tela de comprovantes pendentes

Após o upload em lote, criar uma tela chamada Conferência de Comprovantes.

Cada comprovante deve aparecer com:

miniatura do arquivo;

dados extraídos automaticamente;

sugestão de categoria;

sugestão de perfil;

sugestão de banco;

alerta de duplicidade, se houver;

botão aprovar;

botão editar;

botão rejeitar;

botão marcar como duplicado.

O usuário deve poder aprovar vários comprovantes de uma vez.

Também deve existir edição rápida em tabela.

Pesquisa avançada

Criar uma busca global.

O usuário poderá pesquisar por:

valor;

data;

destinatário;

banco;

categoria;

palavra-chave;

CPF/CNPJ;

código de autenticação;

nome do arquivo;

observação.

A busca deve encontrar tanto lançamentos quanto arquivos de comprovantes.

Segurança

O sistema deve transmitir segurança.

Implementar:

login com e-mail e senha;

recuperação de senha;

autenticação em dois fatores, se possível;

controle por usuário;

criptografia ou armazenamento seguro dos arquivos;

permissões por perfil;

backup dos comprovantes;

logs de alteração.

Criar níveis de usuário:

administrador;

proprietário;

contador;

visualizador;

colaborador.

Permissões:

ver;

adicionar;

editar;

excluir;

aprovar comprovantes;

exportar relatórios;

gerenciar usuários;

gerenciar perfis.

Histórico e auditoria

Toda alteração deve gerar histórico.

Registrar:

quem enviou o comprovante;

quem aprovou;

quem editou;

data e hora da alteração;

campo alterado;

valor antigo;

valor novo.

Isso é importante para holdings, empresas e organização patrimonial.

Imóveis

Como o sistema também atende holdings e pessoas que trabalham com imóveis, criar uma área opcional chamada Imóveis.

Campos:

nome do imóvel;

endereço;

cidade;

estado;

matrícula, opcional;

proprietário;

perfil vinculado;

tipo: casa, apartamento, sala comercial, terreno, fazenda, prédio ou outro;

status: próprio, alugado, em reforma, vendido, em aquisição;

observações.

Cada despesa ou investimento poderá ser vinculado a um imóvel.

O sistema deve permitir ver:

total gasto por imóvel;

total investido por imóvel;

despesas fixas por imóvel;

despesas variáveis por imóvel;

comprovantes vinculados ao imóvel;

relatório individual do imóvel.

Organização por pastas

Além da organização financeira, o sistema deve organizar os comprovantes em pastas automáticas.

Exemplo:

Perfil;

Ano;

Mês;

Banco;

Categoria;

Imóvel;

Destinatário.

O usuário também poderá criar pastas manuais.

Inteligência financeira

Criar alertas inteligentes, como:

gasto acima da média;

categoria que aumentou muito;

banco com maior volume de gastos;

comprovante possivelmente repetido;

despesa fixa não encontrada no mês atual;

destinatário recorrente sem categoria;

comprovantes pendentes de aprovação;

concentração de gastos em determinado banco;

aumento de despesas variáveis.

Fluxo principal do usuário

Usuário cria conta.

Cria um perfil financeiro.

Cadastra bancos, contas e cartões.

Faz upload dos comprovantes.

O sistema lê e analisa os comprovantes.

O sistema sugere categoria, banco, perfil e tipo de gasto.

O sistema verifica se existe duplicidade.

O usuário aprova ou corrige.

O sistema salva o comprovante no cofre.

O sistema atualiza o dashboard.

O usuário gera relatórios financeiros.

Telas necessárias

Criar as seguintes telas:

Login;

Cadastro;

Recuperar senha;

Dashboard geral;

Perfis financeiros;

Bancos e contas;

Cartões;

Upload de comprovantes;

Conferência de comprovantes;

Cofre de comprovantes;

Lançamentos financeiros;

Categorias;

Destinatários recorrentes;

Imóveis;

Relatórios;

Relatório detalhado;

Usuários e permissões;

Configurações;

Personalização da marca;

Histórico e auditoria.

Banco de dados sugerido

Criar tabelas/coleções para:

users;

profiles;

banks;

accounts;

cards;

receipts;

transactions;

categories;

recipients;

properties;

reports;

audit_logs;

settings;

permissions;

files.

Campos principais do lançamento financeiro

Cada lançamento deve conter:

ID;

perfil;

banco;

conta;

cartão;

imóvel vinculado, opcional;

destinatário;

CPF/CNPJ do destinatário, opcional;

data;

valor;

categoria;

subcategoria;

tipo: despesa, investimento, gasto fixo, gasto variável, pessoal, empresarial ou patrimonial;

forma de pagamento;

comprovante anexado;

status: pendente, aprovado, rejeitado, duplicado;

observações;

criado por;

aprovado por;

data de criação;

data de aprovação.

Regras importantes

O sistema não deve calcular lucro, receita ou faturamento.

O sistema deve focar em controle de saídas financeiras, despesas, gastos, investimentos e comprovantes.

Todo lançamento deve preferencialmente ter um comprovante vinculado.

O sistema deve impedir ou alertar fortemente quando um comprovante já foi enviado antes.

O usuário sempre deve poder corrigir manualmente os dados identificados pela inteligência artificial.

O sistema deve aprender com os lançamentos anteriores para melhorar as sugestões futuras.

Experiência do usuário

O sistema deve ser simples, rápido e visual.

Evite telas poluídas.

Use cards, gráficos e tabelas organizadas.

No celular, priorize botões grandes, filtros simples e visualização clara dos comprovantes.

No computador, permita visão em tabela, edição em massa e relatórios detalhados.

Funcionalidade premium futura

Deixar a estrutura preparada para planos pagos, com possibilidade de:

limite de comprovantes por plano;

limite de perfis por plano;

limite de usuários;

armazenamento em nuvem;

relatórios avançados;

personalização com marca;

acesso para contador;

inteligência artificial avançada.

Resultado esperado

Entregue um sistema funcional, moderno e responsivo chamado Meu Cofre, com dashboard, cadastro de perfis, bancos, contas, cartões, imóveis, categorias, upload de comprovantes, análise automática, prevenção de duplicidade, conferência manual, armazenamento organizado e geração de relatórios profissionais.

Priorize especialmente:

Upload e armazenamento seguro de comprovantes;

Leitura automática dos comprovantes;

Detecção de comprovantes repetidos;

Separação por perfil, banco, conta, cartão, imóvel e categoria;

Relatórios completos de despesas e investimentos;

Interface simples, bonita e profissional.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://cofre-inteligente-arquivos.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/a2f7021f-9498-4bff-aea4-44361037a611).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
