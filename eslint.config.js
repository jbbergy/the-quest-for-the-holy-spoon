import js from '@eslint/js'
import vue from 'eslint-plugin-vue'
import tseslint from 'typescript-eslint'

const MODULES = ['account', 'household', 'player_profile', 'nutrition_inventory', 'planning']

/** Paquets interdits dans le domaine : il reste du TypeScript pur. */
const FRAMEWORK_FREE_PATHS = [
  { name: 'vue', message: 'Le domaine ne dépend d’aucun framework UI.' },
  { name: 'pinia', message: 'Le domaine ne dépend d’aucun store.' },
  { name: 'zod', message: 'La validation Zod appartient à la couche ACL/infrastructure.' },
  { name: 'idb', message: 'Le domaine ignore tout du stockage.' },
  { name: 'gsap', message: 'Le domaine ignore tout de l’animation.' },
]

const foreignModulePatterns = (self) =>
  MODULES.filter((other) => other !== self).map((other) => ({
    group: [
      `@/modules/${other}/domain`,
      `@/modules/${other}/domain/**`,
      `@/modules/${other}/infrastructure`,
      `@/modules/${other}/infrastructure/**`,
      `@/modules/${other}/presentation`,
      `@/modules/${other}/presentation/**`,
    ],
    message: `Le module "${self}" ne peut atteindre "${other}" que via sa façade @/modules/${other}/application.`,
  }))

/**
 * Matérialise les deux règles structurantes, en une seule entrée
 * `no-restricted-imports` par périmètre — deux entrées qui se recouvrent
 * s'écraseraient silencieusement l'une l'autre.
 */
const moduleConfigs = MODULES.flatMap((self) => [
  {
    // Domaine : pur ET cloisonné.
    files: [`src/modules/${self}/domain/**/*.ts`],
    rules: {
      'no-restricted-imports': [
        'error',
        { paths: FRAMEWORK_FREE_PATHS, patterns: foreignModulePatterns(self) },
      ],
    },
  },
  {
    // Autres couches du module : cloisonnées seulement.
    files: [
      `src/modules/${self}/application/**/*.{ts,vue}`,
      `src/modules/${self}/infrastructure/**/*.{ts,vue}`,
      `src/modules/${self}/presentation/**/*.{ts,vue}`,
    ],
    rules: {
      'no-restricted-imports': ['error', { patterns: foreignModulePatterns(self) }],
    },
  },
])

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'node_modules', 'server/.data'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...vue.configs['flat/recommended'],
  {
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: { parser: tseslint.parser },
    },
  },
  {
    files: ['**/*.{ts,vue}'],
    rules: {
      /**
       * `no-undef` fait doublon avec le compilateur et se trompe : il ignore les
       * types du DOM (`HTMLElement`, `MouseEvent`) et les déclarations globales.
       * TypeScript couvre ce besoin correctement — c'est la recommandation de
       * typescript-eslint pour tout fichier typé.
       */
      'no-undef': 'off',

      /**
       * Une prop optionnelle en TypeScript est explicitement `T | undefined` :
       * exiger une valeur par défaut reviendrait à interdire l'optionalité, que
       * les composants distinguent volontairement de « valeur vide ».
       */
      'vue/require-default-prop': 'off',
    },
  },
  {
    // Scripts de build : exécutés par Node, pas par le navigateur.
    files: ['scripts/**/*.{js,mjs}', 'eslint.config.js', 'vite.config.ts'],
    languageOptions: {
      globals: { process: 'readonly', Buffer: 'readonly', console: 'readonly' },
    },
  },
  {
    // Serveur : exécuté par Node.
    files: ['server/**/*.ts'],
    languageOptions: {
      globals: { process: 'readonly', Buffer: 'readonly', console: 'readonly' },
    },
  },
  {
    // Domaine et use cases du serveur : purs, comme ceux du client.
    files: ['server/src/modules/*/domain/**/*.ts', 'server/src/modules/*/application/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['fastify', '@fastify/*', 'kysely', 'kysely/*', 'pg', '@node-rs/*', 'zod', 'node:*'],
              message: 'Le domaine et les use cases du serveur ignorent toute technologie.',
            },
            {
              group: ['**/infrastructure/**', '**/http/**', '**/shared/**'],
              message: 'Les adaptateurs dépendent du domaine, jamais l’inverse.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { paths: FRAMEWORK_FREE_PATHS }],
    },
  },
  ...moduleConfigs,
)
