import type { MerchantProfile } from '../src/merchant-profile'

/** Boutique pilote (mixte). Utilisée par les tests du moteur et le chat web. */
export const pilotProfile: MerchantProfile = {
  merchantId: 'pilot',
  displayName: 'Boutique Maman',
  currency: 'XOF',
  locale: 'fr-BJ',
  catalogue: [
    {
      productId: 'robe-rouge',
      name: 'Robe rouge',
      aliases: ['robe', 'robe rouge'],
      description: 'Robe en wax, coupe droite',
      photos: [],
      active: true,
      tags: ['vêtement'],
      pricing: {
        kind: 'unit',
        variants: [
          {
            variantId: 'm',
            label: 'Taille M',
            attributes: { taille: 'M' },
            price: 12000,
            stock: 3,
          },
          {
            variantId: 'l',
            label: 'Taille L',
            attributes: { taille: 'L' },
            price: 12000,
            stock: 0,
          },
        ],
      },
    },
    {
      productId: 'chaussure-noire',
      name: 'Chaussure noire',
      aliases: ['chaussure', 'chaussures'],
      description: 'Sandale cuir',
      photos: [],
      active: true,
      tags: ['chaussure'],
      pricing: {
        kind: 'unit',
        variants: [
          {
            variantId: '40',
            label: 'Pointure 40',
            attributes: { pointure: '40' },
            price: 8000,
            stock: null,
          },
        ],
      },
    },
    {
      productId: 'gari',
      name: 'Gari',
      aliases: ['gari'],
      description: 'Gari fin, au kilo',
      photos: [],
      active: true,
      tags: ['alimentation'],
      pricing: {
        kind: 'bulk',
        unitOfMeasure: 'kg',
        pricePerUnit: 600,
        minQuantity: 1,
        stepQuantity: 0.5,
        stockQuantity: 40,
      },
    },
    {
      productId: 'tenue-mesure',
      name: 'Tenue sur mesure',
      aliases: ['tenue', 'couture', 'tenue de mariage'],
      description: 'Tenue cousue à vos mesures',
      photos: [],
      active: true,
      tags: ['couture'],
      pricing: {
        kind: 'madeToOrder',
        basePrice: 25000,
        leadTimeDays: 7,
        depositPercent: 50,
        options: [{ label: 'broderie', extraPrice: 5000 }],
      },
    },
    {
      productId: 'ancien-sac',
      name: 'Sac ancien modèle',
      aliases: ['sac'],
      description: '',
      photos: [],
      active: false,
      tags: [],
      pricing: {
        kind: 'unit',
        variants: [{ variantId: 'u', label: 'Unique', attributes: {}, price: 5000, stock: 0 }],
      },
    },
  ],
  negotiation: {
    enabled: true,
    maxRounds: 3,
    perProduct: {
      'robe-rouge': { floorPrice: 10000, steps: [11500, 11000, 10000] },
      'chaussure-noire': { floorPrice: 7000, steps: [7500, 7000] },
      gari: { floorPrice: 600, steps: [] },
    },
    quantityDiscounts: [{ productId: 'robe-rouge', minQuantity: 3, percentOff: 10 }],
  },
  style: {
    tone: 'chaleureux',
    greeting: 'Bonsoir ma sœur, bien arrivée ?',
    signoff: 'Merci hein, à très vite',
    languageMix: { primary: 'fr', secondary: 'fon', ratio: 0.1 },
    emojiLevel: 1,
    addressForm: 'tu',
    examples: [
      {
        customer: "La robe rouge c'est combien ?",
        merchant: 'La robe rouge est à 12 000 ma sœur, il reste la taille M 🙂',
      },
      {
        customer: "12 000 c'est trop",
        merchant: "Je comprends, je te la laisse à 11 500, c'est déjà un bon prix",
      },
      { customer: 'Ok je prends', merchant: 'Super ! Tu es où pour la livraison ?' },
      {
        customer: 'Vous livrez à Calavi ?',
        merchant: "Oui, Calavi c'est 1 500 de livraison, tu l'as demain",
      },
    ],
    fallbacks: [
      'Je vérifie et je te redis tout de suite ma sœur',
      'Laisse-moi confirmer avec la boutique, je reviens vers toi',
    ],
  },
  delivery: {
    zones: [
      { name: 'Cotonou', fee: 1000, delayHours: 24 },
      { name: 'Calavi', fee: 1500, delayHours: 24 },
      { name: 'Porto-Novo', fee: 2500, delayHours: 48 },
    ],
    pickupAddress: 'Marché Dantokpa, allée 12',
    paymentMethods: ['cash_on_delivery', 'momo_mtn'],
  },
  limits: { maxRepliesPerMonth: 1000, maxReplyChars: 320 },
}
