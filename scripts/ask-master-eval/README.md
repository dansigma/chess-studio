# Avaliação do Pergunte ao Mestre

Guarde a base em `ask-master-eval-data/items.jsonl` e mantenha uma cópia privada. Para comparar modelos ou mudanças de contexto, fixe de 30 a 50 posições distintas e distribua aberturas, meios-jogos e finais pelos três níveis. As pastas padrão da base e dos relatórios são ignoradas pelo Git.

## Como escrever um item

Use um objeto JSON por linha. Dê a cada posição um `id` estável. Especifique a FEN completa e escreva uma pergunta que um jogador daquele nível faria. Em `mustMention`, escreva de três a cinco pontos concretos que podem ser avaliados separadamente. Em `mustNotClaim`, liste erros plausíveis específicos da posição. Aceite formulações equivalentes.

- `level` aceita `u1600`, `1600-2000` e `2000+`. `locale` aceita `pt-br` e `en`.
- `intent` aceita `explain`, `model-games`, `study-opening` e `free`.
- Use `sanLine` para os lances em SAN inglesa até a FEN. Se a linha começar em outra posição, informe `startFen`. Com apenas a FEN, variantes anteriores à posição atual não podem ser validadas.
- Para congelar os dados adicionais enviados ao modelo, inclua `engineLines` (array de `EngineLine`), `lichess` e `xd` (`ExplorerResponse`), ou `xdGames` (array de `ExplorerGameRow`), no formato de produção. Fatos, ameaças e abertura são calculados localmente com o código e o catálogo desta revisão.

```jsonl
{"id":"abertura-siciliana","fen":"rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2","sanLine":["e4","c5"],"level":"u1600","intent":"study-opening","locale":"pt-br","question":"Qual é a ideia de ...c5?","mustMention":["c5 disputa d4","A estrutura fica assimétrica","As brancas podem disputar o centro com d4"],"mustNotClaim":["c5 ataca e4"]}
{"id":"final-promocao","fen":"7k/P7/8/8/8/8/8/4K3 w - - 0 45","level":"2000+","intent":"explain","locale":"pt-br","question":"Como promover imediatamente?","mustMention":["a7 avança a a8","A promoção a dama dá xeque","Dama, torre, bispo e cavalo são escolhas legais"],"mustNotClaim":["O peão só pode promover a dama"]}
```

## Como executar e comparar

Com Node 22+ e as dependências instaladas, exporte `ASK_MASTER_BASE_URL`, `ASK_MASTER_MODEL` e `ASK_MASTER_API_KEY`. A URL base deve apontar para a API compatível com OpenAI, incluindo o prefixo necessário (por exemplo, `/v1`). Use `ASK_MASTER_EVAL_JUDGE_MODEL` para fixar o juiz nas duas execuções. Por padrão, o juiz usa o mesmo modelo da resposta e o mesmo provedor.

```sh
npm run askmaster:eval -- --out ask-master-eval-out/a
ASK_MASTER_MODEL=outro-modelo npm run askmaster:eval -- --out ask-master-eval-out/b
npm run --silent askmaster:compare -- --compare ask-master-eval-out/a/report.json ask-master-eval-out/b/report.json > ask-master-eval-out/comparacao.md
```

Use `--input caminho.jsonl` para escolher outra base. Cada execução gera `report.md` e `report.json`. O script envia a pergunta e o pacote de produção ao modelo, depois envia a resposta e a rubrica ao juiz. A pontuação usa a primeira resposta, antes de qualquer reescrita pela auditoria de produção. A latência da resposta e a do juiz são medidas em separado.

O juiz devolve uma decisão por ponto e cita trechos da resposta como evidência. Uma falha na chamada ou JSON inválido deixa os pontos daquela posição como `unknown`. O comando grava os relatórios mesmo quando uma posição falha e termina com código 1 se houver falha de resposta ou do juiz. O JSON inclui o texto avaliado, as variantes inválidas ou sem posição de partida verificável e os motivos das rejeições da auditoria. Os números contam percentuais e avaliações decimais com sinal. A comparação alinha as posições por ID e sinaliza mudanças no item ou no arquivo de entrada.
