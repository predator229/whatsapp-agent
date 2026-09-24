/**
 * Les cibles atomisées `test-ci--*` n'exécutent qu'un fichier de spec : la couverture par fichier
 * n'atteint jamais les seuils de la lib entière. On active donc la couverture pour la cible
 * agrégée `test` (et pour un `vitest` nu), pas pour les enfants `test-ci`.
 */
export function coverageEnabledForTarget(): boolean {
  return !(process.env['NX_TASK_TARGET_TARGET'] ?? '').startsWith('test-ci')
}
