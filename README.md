# Finanças 2.0

Versão independente de [Minhas Finanças original](https://github.com/palomagl/minhas-financas). **O repositório original não foi alterado.**

## Implementado no repositório novo

- Primeira reformulação visual com paleta neutra (verde-sálvia/grafite), marca SVG, tela de abertura e favicon atualizados.
- Base original preservada: despesas por mês, parcelas, marcação de pagamento, exportação CSV e PWA offline.
- Saldo pessoal calculado por saldo inicial/ajustes + entradas − despesas marcadas como pagas.
- Entradas simples com valor e descrição; ajustes com registro no histórico; exclusão de entradas.
- Espaço pessoal privado, alternância para área de família, criação de família, convites por códigos aleatórios válidos por 24h, entrada com login individual e registro de despesas com responsável pelo pagamento e divisão igualitária ou sem divisão.
- Regras do Firestore propostas para isolar dados pessoais e restringir acesso às famílias e convites.
- Verificação de sintaxe no GitHub Actions.

## Limitações atuais (importante)

**O projeto ainda precisa de configuração do novo Firebase e testes reais de integração.** O login está configurado no mesmo projeto Firebase do original, usando o segundo cadastro de aplicativo Web informado pela proprietária. As despesas da v2 usam `v2_users` e as famílias usam `v2_families`/`v2_invites`; não reutilizam a coleção `users` do app original.

As despesas familiares registram quem pagou, mas **ainda não debitam automaticamente o saldo pessoal**. Também ainda faltam: acertos financeiros entre membros, contribuição individual no pagamento conjunto, edição/exclusão de despesas familiares e testes multiusuário de concorrência/segurança. O modo de divisão da família é informativo nesta etapa.

O código do convite gera um token hexadecimal longo, não o código curto de seis caracteres pensado inicialmente. Esta escolha reduz o risco de adivinhação enquanto não houver um servidor dedicado para controlar tentativas.

## Configuração antes de testar

1. Reutilize o projeto Firebase existente `minhas-financas-cee4e` (já configurado em `firebase-config.js` com o appId Web da v2).
2. Confirme que o login Google está ativo em Authentication.
3. Antes de alterar regras de produção, valide `firestore.rules` em um emulador/testes: esse arquivo mantém o acesso privado de `users` e acrescenta `v2_users`, `v2_families` e `v2_invites`.
4. Publique as regras **somente depois de testar**, no mesmo Firestore do projeto existente; nunca substitua as regras de produção sem revisão.
5. Em Authentication, autorize o domínio exato do novo site Vercel.
6. Teste com duas contas Google diferentes e confira que o app original permanece funcionando.

## Organização

`app.js` conserva as despesas originais; `finance2.js` adiciona movimentações e família. `index.html`, `styles.css`, `icons/`, `manifest.webmanifest` e `sw.js` controlam interface e instalação.

## Logo

A abertura voltou a utilizar a imagem original (`icons/original-splash.png`), com filtro CSS alterando somente o tom rosa para verde. Essa opção mantém a composição do primeiro app. Os demais ícones ainda podem precisar de revisão visual final.
