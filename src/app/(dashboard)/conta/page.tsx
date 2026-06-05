REPLACE_ONLY
- Alterar linha setPlans(data.plans || []) para:
setPlans((data.plans || []).filter((p: PlanOption) => p.id !== 'PACK'))

- Alterar texto:
"Esses planos são configurados manualmente pelo administrador."
para:
"Os planos exibidos podem variar conforme sua assinatura."

- Dentro do card de créditos, após a linha 'Usados: {user.creditsUsed || 0}', adicionar:
<div className="text-xs text-green-400 mt-2">✓ Ferramenta Gerar Questões liberada</div>

- Não exibir o plano PACK na grade de planos para usuários finais.