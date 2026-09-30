import { isPositiveRupiah } from './dashboardFinance.js';

export class ManualAssetPriceProvider {
  async getCurrentPrice(asset) {
    return asset.price;
  }

  async acceptManualPrice(asset, price) {
    if (!isPositiveRupiah(price)) throw new Error('Harga harus berupa rupiah integer lebih dari nol.');
    return { id: asset.id, price, source: 'manual' };
  }
}

export function createAssetPriceProvider(provider) {
  return provider || new ManualAssetPriceProvider();
}