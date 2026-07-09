// Cliente Claude (Anthropic) compartilhado + prompts do RESUMO DE ATIVIDADES.
// Usado por /api/resumo (geração sob demanda no painel) e /api/teams (envio
// agendado do resumo ao canal do Teams).

export const MODELO = process.env.ANTHROPIC_MODELO || 'claude-opus-4-8';

// Schema da saída (structured outputs): garante JSON válido e do formato esperado.
export const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['geral', 'pessoas'],
  properties: {
    geral: { type: 'string' },
    pessoas: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'resumo', 'sinal'],
        properties: {
          id: { type: 'string' },
          resumo: { type: 'string' },
          sinal: { type: 'string', enum: ['positivo', 'neutro', 'atencao'] },
        },
      },
    },
  },
};

export const SISTEMA = [
  'Você é um analista de produtividade de um time de TI. Recebe MÉTRICAS já agregadas',
  'de uso do Jira (atividade) e do Clockwork (horas apontadas) de cada pessoa, em um',
  'período. Sua tarefa é escrever um RESUMO claro e objetivo das atividades de cada',
  'pessoa, em português do Brasil.',
  '',
  'Regras:',
  '- Baseie-se EXCLUSIVAMENTE nos números fornecidos. Nunca invente dados, nomes ou fatos.',
  '- Para cada pessoa, escreva 2 a 4 frases cobrindo: a cadência de apontamento (horas no',
  '  período, média por dia útil, dias sem apontar vs. a meta), o volume e o tipo de',
  '  atividade (tickets tocados, alterações, transições/conclusões de status, criações) e',
  '  a colaboração (comentários — sinal de troca com o time). Destaque o que for relevante.',
  '- Classifique cada pessoa em "sinal": "positivo" (em dia com a meta e ativa),',
  '  "neutro" (parcial/mediano) ou "atencao" (apontamento bem abaixo da meta, ou sem',
  '  atividade). Use os números, não suposições.',
  '- Seja construtivo e factual, sem juízo de valor pessoal. Não trate ausência de horas',
  '  como falha se houver indício de ausência/férias; apenas descreva o que os dados mostram.',
  '- "Concluídas" é um total do time (sem atribuição individual) — comente apenas no resumo geral.',
  '- "geral": 2 a 4 frases sobre o time no período (volume de horas, % faturável, tickets',
  '  criados/concluídos, e quem se destacou ou merece atenção).',
  '- Não use markdown pesado; texto corrido. Mantenha cada resumo curto.',
].join('\n');

// Chamada única ao modelo com structured output. custom={system,schema,prompt}
// permite reusar o cliente para outros prompts (ex.: qualidade dos tickets).
export async function chamaClaude(apiKey, payload, custom) {
  const base = (process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com').replace(/\/+$/, '');
  const corpo = {
    model: MODELO,
    max_tokens: 8000,
    system: (custom && custom.system) || SISTEMA,
    output_config: {
      effort: 'low',                       // tarefa de sumarização: rápida e barata
      format: { type: 'json_schema', schema: (custom && custom.schema) || SCHEMA },
    },
    messages: [{
      role: 'user',
      content: (custom && custom.prompt) || ('Gere o resumo a partir destes dados (JSON):\n\n' + JSON.stringify(payload)),
    }],
  };
  const r = await fetch(`${base}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(corpo),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`Anthropic ${r.status}: ${t.slice(0, 300)}`);
  }
  const data = await r.json();
  if (data.stop_reason === 'refusal') {
    throw new Error('O modelo recusou a solicitação.');
  }
  const bloco = (data.content || []).find((b) => b.type === 'text');
  if (!bloco) throw new Error('Resposta sem conteúdo.');
  return JSON.parse(bloco.text);
}
