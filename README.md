# ZPL para PDF

Conversor de etiquetas ZPL para PDF que roda inteiramente no navegador. O
arquivo não é enviado para APIs ou servidores e cada etiqueta é adicionada ao
PDF como uma página no tamanho físico correto.

## Recursos

- abre `.zpl`, `.txt` e `.prn` ou recebe código colado;
- interpreta textos, gráficos e códigos de barras com `zplr`;
- respeita `^PW`, `^LL`, `^PQ` e múltiplos blocos `^XA` / `^XZ`;
- oferece prévia paginada e avisos de compatibilidade;
- gera PDF multipágina com páginas de tamanhos diferentes;
- processa tudo localmente, sem cadastro ou upload.

## Executar

Requer Node.js 22.13 ou mais recente.

```bash
npm install
npm run dev
```

Abra `http://localhost:3000`.

## Verificar

```bash
npm test
npm run lint
npm run build
```

Para uma publicação futura, defina `NEXT_PUBLIC_SITE_URL` com a origem pública
antes do build para que a imagem social use uma URL absoluta correta.

## Railway

O arquivo `railway.json` configura o build e a inicialização. No Railway, o
servidor usa automaticamente a variável `PORT` e o domínio público fornecido
pela plataforma.

## Observações de impressão

O PDF não adiciona margens. Na caixa de impressão, use escala de 100%, desative
o ajuste automático e selecione na impressora o mesmo tamanho exibido na
prévia.

## Contribuições

Issues e pull requests são bem-vindos. Antes de enviar, rode `npm test`,
`npm run lint` e `npm run build`. Se possível, inclua em
`tests/fixtures/` um exemplo de ZPL que reproduza o problema (sem dados reais
de clientes, endereços ou códigos de rastreio).

## Licença

Distribuído sob a licença MIT. Veja [LICENSE](LICENSE).

Bibliotecas de terceiros usadas: [zplr](https://www.npmjs.com/package/zplr)
e [pdf-lib](https://pdf-lib.js.org/), ambas MIT.
