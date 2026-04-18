import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'quantityFormat',
  standalone: false,
})
export class QuantityFormatPipe implements PipeTransform {
  transform(value: number | string | null | undefined): string {
    if (value == null || value === '') return '';
    const num = typeof value === 'string' ? parseFloat(value) : value;
    if (num === 0) return '';
    if (!Number.isFinite(num)) return '';
    if (Number.isInteger(num)) return String(num);
    return num.toFixed(2).replace(/\.?0+$/, '');
  }
}
