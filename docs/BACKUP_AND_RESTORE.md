# Backup e restauração

## Rotina mínima

- Banco: exportação lógica diária (`pg_dump`), retenção de 35 dias.
- Mensal: retenção de 12 cópias mensais.
- Armazenamento: bucket corporativo separado do Supabase/Render, com acesso
  restrito, criptografia em repouso e MFA obrigatório para administradores.
- Responsável: TI ou administrador nomeado; registre a execução e falhas.
- Arquivos anexos, quando existirem: incluir na mesma rotina, nunca apenas no
  disco temporário do servidor.

## Restauração de teste trimestral

1. Crie um banco de **homologação**, sem apontar o sistema de produção para ele.
2. Restaure uma cópia recente e valide contagem de processos, clientes e
   usuários sem expor dados fora da equipe autorizada.
3. Abra o sistema de homologação, execute login com conta de teste e consulte
   os dados esperados.
4. Registre data, responsável, duração e resultado. Corrija falhas antes do
   próximo ciclo.

## Incidente

1. Pausar gravações e preservar logs.
2. Definir o ponto de restauração com TI e a área responsável.
3. Restaurar primeiro em homologação; aprovar a validação.
4. Restaurar produção, validar saúde (`/api/health`), login e amostra de dados.
5. Rotacionar credenciais se houver suspeita de comprometimento.

O Supabase/Render e o repositório devem usar MFA obrigatório para todos os
administradores. O plano gratuito pode não oferecer recuperação pontual; por
isso a cópia externa e o teste periódico são necessários.
