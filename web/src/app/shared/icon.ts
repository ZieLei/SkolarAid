// =====================================================================
// icon.ts - <app-icon name="..."> shows an icon from the Hugeicons set.
// To add an icon: import it and add a name for it in ICONS below.
// =====================================================================
import { Component, computed, input } from '@angular/core';
import { HugeiconsIconComponent } from '@hugeicons/angular';
import {
  Analytics01Icon, Attachment01Icon, CheckmarkCircle02Icon, ChartBarLineIcon, Clock01Icon, DashboardSquare01Icon,
  File01Icon, GraduationScrollIcon, Invoice01Icon, Money01Icon, MoneyBag02Icon, Note01Icon, Notification01Icon,
  Task01Icon, UserCircleIcon, UserGroupIcon, UserIcon, Wallet01Icon, Cancel01Icon,
  PrinterIcon, Download04Icon, RefreshIcon, Xls01Icon, Doc01Icon, Pdf01Icon, FilterHorizontalIcon, ArrowRight01Icon, PieChartIcon,
  ChartLineData02Icon, ChartColumnIcon, FileSearchIcon, MoneyReceive02Icon, Table01Icon, AlarmClockIcon, Calendar03Icon, Mail01Icon, SmartPhone01Icon, InformationCircleIcon, Search01Icon, Menu01Icon, Logout01Icon, Alert02Icon, FolderOpenIcon, Folder01Icon,
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
  overdue: AlarmClockIcon,
  menu: Menu01Icon,
  logout: Logout01Icon,
  calendar: Calendar03Icon,
  mail: Mail01Icon,
  phone: SmartPhone01Icon,
  info: InformationCircleIcon,
  search: Search01Icon,
  // document-upload slots / report templates
  attachment: Attachment01Icon,
  note: Note01Icon,
  task: Task01Icon,
  chart: ChartBarLineIcon,
  invoice: Invoice01Icon,
  money: MoneyBag02Icon,
  // reports page
  printer: PrinterIcon,
  download: Download04Icon,
  refresh: RefreshIcon,
  'file-xls': Xls01Icon,
  'file-doc': Doc01Icon,
  'file-pdf': Pdf01Icon,
  filter: FilterHorizontalIcon,
  'arrow-right': ArrowRight01Icon,
  'pie-chart': PieChartIcon,
  'line-chart': ChartLineData02Icon,
  'bar-chart': ChartColumnIcon,
  'file-search': FileSearchIcon,
  receipt: MoneyReceive02Icon,
  table: Table01Icon,
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
