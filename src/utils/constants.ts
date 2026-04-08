export interface EffectConfig {
  id: string;
  name: string;
  bgColor?: string;
  cssClass?: string;
  overlayAssets?: EffectAsset[];
  foregroundAssets?: EffectAsset[];
}

export interface EffectAsset {
  id: string;
  src: string;
  alt: string;
  className: string;
}

export const BACKGROUND_EFFECTS: EffectConfig[] = [
  { id: 'none', name: '无特效', bgColor: '#262626', cssClass: 'effect-none' },
  {
    id: 'hands',
    name: '手捧',
    bgColor: '#e6e6e6',
    cssClass: 'effect-hands',
    foregroundAssets: [
      {
        id: 'hands-left',
        src: '/effects/hand-left.svg',
        alt: '',
        className: 'effect-asset-hand-left',
      },
      {
        id: 'hands-right',
        src: '/effects/hand-right.svg',
        alt: '',
        className: 'effect-asset-hand-right',
      },
    ],
  },
  {
    id: 'blood',
    name: '血迹',
    bgColor: '#120708',
    cssClass: 'effect-blood',
    overlayAssets: [
      {
        id: 'blood-top-left',
        src: '/effects/blood.svg',
        alt: '',
        className: 'effect-asset-blood-top-left',
      },
      {
        id: 'blood-top-right',
        src: '/effects/blood.svg',
        alt: '',
        className: 'effect-asset-blood-top-right',
      },
      {
        id: 'blood-bottom-center',
        src: '/effects/blood.svg',
        alt: '',
        className: 'effect-asset-blood-bottom-center',
      },
    ],
  },
  { id: 'wood', name: '木桌', bgColor: '#3d2314', cssClass: 'effect-wood' },
  { id: 'marble', name: '大理石', bgColor: '#d8dadd', cssClass: 'effect-marble' },
  { id: 'grass', name: '草地', bgColor: '#1e4620', cssClass: 'effect-grass' },
  { id: 'desk', name: '办公桌', bgColor: '#242326', cssClass: 'effect-desk' },
  { id: 'concrete', name: '水泥地', bgColor: '#7b7f86', cssClass: 'effect-concrete' },
  { id: 'sand', name: '沙滩', bgColor: '#d8b07a', cssClass: 'effect-sand' },
  { id: 'water_drops', name: '水滴', bgColor: '#0077b6', cssClass: 'effect-water-drops' },
  { id: 'fire', name: '火焰', bgColor: '#1a0000', cssClass: 'effect-fire' },
  { id: 'ice', name: '冰块', bgColor: '#a8dadc', cssClass: 'effect-ice' },
  { id: 'neon', name: '霓虹灯', bgColor: '#0b090a', cssClass: 'effect-neon' },
  { id: 'space', name: '星空', bgColor: '#03045e', cssClass: 'effect-space' },
  { id: 'vintage', name: '复古', bgColor: '#dda15e', cssClass: 'effect-vintage' },
  { id: 'futuristic', name: '未来科技', bgColor: '#000000', cssClass: 'effect-futuristic' },
  { id: 'coffee_stain', name: '咖啡渍', bgColor: '#f0d8b6', cssClass: 'effect-coffee-stain' },
  { id: 'crumpled', name: '褶皱', bgColor: '#b5b8bc', cssClass: 'effect-crumpled' },
  { id: 'grid', name: '网格', bgColor: '#2d3137', cssClass: 'effect-grid' },
  { id: 'blueprint', name: '蓝图', bgColor: '#003049', cssClass: 'effect-blueprint' },
  { id: 'blackboard', name: '黑板', bgColor: '#1f3129', cssClass: 'effect-blackboard' },
];
