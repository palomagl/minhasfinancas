# Finanças 2.0

Nova cópia independente do aplicativo [Minhas Finanças original](https://github.com/palomagl/minhas-financas). O original permanece intocado.

## Primeira etapa

- Estrutura HTML/CSS/JS, lógica de despesas e PWA copiadas do projeto original.
- Paleta inicial de cores neutras e favicon SVG novo.
- Isolamento: o Firebase anterior **não foi copiado**. O login estará desativado até configurar um projeto Firebase novo.

## Para executar

1. Crie um projeto Firebase diferente do original.
2. Ative Google Authentication e Firestore.
3. Configure os dados do projeto novo em `firebase-config.js`.
4. Publique `firestore.rules` **somente no Firebase novo** e autorize o novo domínio.
5. Publique em outra implantação Vercel, sem reutilizar o domínio antigo.

## Próximas etapas

Adicionar receitas simples, saldo inicial e ajustes, finanças pessoais privadas, família compartilhada por convites e controle de quem pagou. **Ainda não há compartilhamento familiar implementado:** ele exige novas regras de acesso auditadas, além das telas. O projeto não deve ser divulgado como funcional até essa etapa estar concluída.
