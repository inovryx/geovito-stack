export type SlotId = 'home_mid' | 'atlas_incontent' | 'blog_incontent' | 'sidebar_small';

type SlotSizeRule = {
  mobile: number;
  tablet: number;
  desktop: number;
};

type SlotConfig = {
  slot: SlotId;
  size: SlotSizeRule;
};

const SLOT_CONFIG: Record<SlotId, SlotConfig> = {
  home_mid: {
    slot: 'home_mid',
    size: {
      mobile: 100,
      tablet: 250,
      desktop: 90,
    },
  },
  atlas_incontent: {
    slot: 'atlas_incontent',
    size: {
      mobile: 250,
      tablet: 250,
      desktop: 250,
    },
  },
  blog_incontent: {
    slot: 'blog_incontent',
    size: {
      mobile: 250,
      tablet: 250,
      desktop: 250,
    },
  },
  sidebar_small: {
    slot: 'sidebar_small',
    size: {
      mobile: 250,
      tablet: 250,
      desktop: 250,
    },
  },
};

export const ADS_ENABLED = import.meta.env.PUBLIC_ADS_ENABLED === 'true';
export const ADS_SCRIPT_URL = (import.meta.env.PUBLIC_ADS_SCRIPT_URL || '').trim();

export const getAdSlotConfig = (slot: SlotId) => SLOT_CONFIG[slot];

export const getAdSlotElementId = (slot: SlotId) => `gv-ad-${slot}`;

export const getAdScriptUrl = () => (ADS_ENABLED && ADS_SCRIPT_URL ? ADS_SCRIPT_URL : null);
