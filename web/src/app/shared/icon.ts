import { Component, computed, input } from '@angular/core';
import { HugeiconsIconComponent } from '@hugeicons/angular';
import {
  Analytics01Icon, Attachment01Icon, CheckmarkCircle02Icon, ChartBarLineIcon, Clock01Icon, DashboardSquare01Icon,
  File01Icon, GraduationScrollIcon, Invoice01Icon, Money01Icon, MoneyBag02Icon, Note01Icon, Notification01Icon,
  Task01Icon, UserCircleIcon, UserGroupIcon, UserIcon, Wallet01Icon, Cancel01Icon, Menu01Icon, Alert02Icon, FolderOpenIcon, Folder01Icon,
} from '@hugeicons/core-free-icons';

/** Maps the semantic names used across the app (formerly PNG file names) to Hugeicons. */
export const ICONS: Record<string, typeof UserIcon> = {
  analysis: Analytics01Icon,
  bell: Notification01Icon,
  checked: CheckmarkCircle02Icon,
  dashboard: DashboardSquare01Icon,
  dollar: Money01Icon,
  file: File01Icon,
  'open-folder': FolderOpenIcon,
  folder: Folder01Icon,
  reject: Cancel01Icon, Alert02Icon,
  scholar: GraduationScrollIcon,
  'user-groups': UserGroupIcon,
  user: UserIcon,
  'user-profile': UserCircleIcon,
  'wall-clock': Clock01Icon,
  wallet: Wallet01Icon,
  alert: Alert02Icon,
  menu: Menu01Icon,
  // document-upload slots / report templates
  attachment: Attachment01Icon,
  note: Note01Icon,
  task: Task01Icon,
  chart: ChartBarLineIcon,
  invoice: Invoice01Icon,
  money: MoneyBag02Icon,
};

/** `<app-icon name="bell" />` — size it with width/height classes; colour follows the text colour. */
@Component({
  selector: 'app-icon',
  imports: [HugeiconsIconComponent],
  host: { style: 'display:inline-flex;flex:none;align-items:center;justify-content:center' },
  template: `@if (icon(); as i) { <hugeicons-icon [icon]="i" size="100%" color="currentColor" [strokeWidth]="1.6" /> }`,
})
export class AppIcon {
  /** Icon key (see ICONS). */
  name = input.required<string>();
  protected icon = computed(() => ICONS[this.name()]);
}
