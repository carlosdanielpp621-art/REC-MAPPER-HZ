# Análise do funcionamento

## Estrutura original preservada
- `index.html`: aviso e concordância para inscrição.
- `formulario.html`: perguntas, cadastro público e edição por responsáveis.
- `login.html`: Google pelo Supabase.
- `registro.html`: lista filtrada, trancamento, liberação de reenvio e equipe.
- `detalhe.html`: respostas, análise, decisão, revisão, histórico, cópia e exclusão.
- `sucesso.html`: confirmação e prazo de retorno de até 10 dias, conforme texto original.
- `assets/app.js`: sessão, papéis, funções de leitura e gravação e navegação.
- `assets/styles.css`: aparência e comportamento em celular.
- `api/mapper-delivery.js`: envio seguro ao Discord no Vercel.

## Dados
O Supabase é a fonte oficial de informações; armazenamento local não é usado como substituto de registros privados.
`mapper_roles` mantém as contas existentes e recebeu identificador interno para ações sem revelar e-mails. `formulario_config` já possui uma linha por servidor. `formulario_historico` guarda decisões. `mapper_delivery_queue` é privada e guarda avisos ao Discord.
Operações privilegiadas ficam em `mapper_private`; funções públicas apenas encaminham para operações que conferem identidade, cargo, servidor e entradas.
A API pública não pode mais listar formulários, editar status diretamente ou ler cargos. A submissão pública retorna somente o identificador do novo formulário e um comprovante aleatório para o aviso ao Discord.

## Problemas identificados no ZIP
- O banco já usava cargos gerais novos, mas o JavaScript ainda esperava `super_admin`.
- Trancamento considerava apenas a linha 1, bloqueando globalmente ou ignorando outros servidores.
- O painel de membros não pedia nick/RG e exibia e-mails para todos.
- Aprovar/recusar alterava a tela mesmo após erro de gravação; não exigia motivo.
- Não havia revisão nem histórico visível.
- Leituras/alterações de inscrições eram públicas no banco.
- Webhooks do Discord estavam visíveis em código enviado ao navegador.

## Orientação para próximas correções
Preserve os papéis e o escopo do servidor no banco. Não confie em ocultar botões como autorização. Alterações de estado e histórico devem ocorrer juntas. Não exponha e-mails em respostas para cargos locais. Não invente nick/RG de contas antigas. Não guarde segredos no HTML/JavaScript público. Se alterar campos, revise os mapeamentos do formulário, edição, cópia e Discord em conjunto. Se mudar o domínio, revise o retorno Google no Supabase.

## Limites da análise
O arquivo contém apenas o setor Mapper; tabelas Staff existem no mesmo banco, mas suas páginas não foram fornecidas. Não foi realizada auditoria de produção completa nem teste de login Google autenticado. Contas e registros existentes não foram migrados para outro serviço.
