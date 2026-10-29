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

**O projeto ainda precisa de configuração do novo Firebase e testes reais de integração.** O login está intencionalmente desativado para não conectar a versão 2.0 ao banco do app original.

As despesas familiares registram quem pagou, mas **ainda não debitam automaticamente o saldo pessoal**. Também ainda faltam: acertos financeiros entre membros, contribuição individual no pagamento conjunto, edição/exclusão de despesas familiares e testes multiusuário de concorrência/segurança. O modo de divisão da família é informativo nesta etapa.

O código do convite gera um token hexadecimal longo, não o código curto de seis caracteres pensado inicialmente. Esta escolha reduz o risco de adivinhação enquanto não houver um servidor dedicado para controlar tentativas.

## Configuração antes de testar

1. Crie um projeto Firebase **novo** e diferente de `minhas-financas-cee4e`.
2. Ative Authentication com Google e crie o Cloud Firestore no projeto novo.
3. Preencha `firebase-config.js` com os dados **do novo projeto**.
4. Publique `firestore.rules` nesse novo Firestore (as regras só são aplicadas quando implantadas no Firebase).
5. Autorize o domínio da nova implantação no Authentication.
6. Publique em um projeto da Vercel separado da versão original.
7. Teste com duas contas Google diferentes e valide as permissões antes de disponibilizar para outras pessoas.

## Organização

`app.js` conserva as despesas originais; `finance2.js` adiciona movimentações e família. `index.html`, `styles.css`, `icons/`, `manifest.webmanifest` e `sw.js` controlam interface e instalação.
