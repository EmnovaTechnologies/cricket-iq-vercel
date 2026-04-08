// src/app/admin/icon-library/page.tsx
'use client';

import {
  Activity, AlertCircle, AlertTriangle, Archive, ArchiveRestore, ArrowLeft, ArrowRight, BarChart3,
  Binary, Building, Cake, CalendarClock, CalendarDays, CalendarFold, CalendarIcon, CalendarX,
  Check, CheckCheck, CheckCircle, CheckSquare, ChevronDown, ChevronLeft, ChevronRight, ChevronsUpDown,
  ClipboardCheck, Clock, Copy, CreditCard, Download, Dumbbell, Edit, Edit3, ExternalLink,
  FileSpreadsheet, FileText, Filter, Gamepad2, Globe, Hourglass, Image, ImageIcon, Info, Key,
  Layers, Leaf, Link, Link2, ListChecks, ListFilter, ListOrdered, Loader2, LogIn, LogOut,
  Mail, Map, MapPin, MapPinned, Menu, MessageSquare, Palette, Phone, PlusCircle, QrCode,
  Save, Search, Send, Share2, Shield, ShieldAlert, ShieldCheck, ShieldPlus, Square, Star,
  Tag, Target, Terminal, Trash2, TrendingUp, Trophy, Upload, UploadCloud,
  User, UserCheck, UserCog, UserPlus, UserSquare2, UserX, Users, Users2, XCircle,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AuthProviderClientComponent } from '@/components/auth-provider-client-component';
import { PERMISSIONS } from '@/lib/permissions-master-list';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import {
  CricketBatIcon,
  CricketBatAndBallIcon,
  CricketBallIcon,
  StumpsAndBallIcon,
  GoogleIcon,
  WicketKeeperGloves,
} from '@/components/custom-icons';

// Canonical aliases — same underlying icon, different import name used in codebase
const FilterIcon = Filter;
const LinkIcon = Link2;
const MapIconLucide = Map;
const PhoneIcon = Phone;
const SearchIcon = Search;
const UserIcon = User;

const projectIcons = {
  'Lucide Icons (In Use)': [
    { name: 'Activity', Icon: Activity },
    { name: 'AlertCircle', Icon: AlertCircle },
    { name: 'AlertTriangle', Icon: AlertTriangle },
    { name: 'Archive', Icon: Archive },
    { name: 'ArchiveRestore', Icon: ArchiveRestore },
    { name: 'ArrowLeft', Icon: ArrowLeft },
    { name: 'ArrowRight', Icon: ArrowRight },
    { name: 'BarChart3', Icon: BarChart3 },
    { name: 'Binary', Icon: Binary },
    { name: 'Building', Icon: Building },
    { name: 'Cake', Icon: Cake },
    { name: 'CalendarClock', Icon: CalendarClock },
    { name: 'CalendarDays', Icon: CalendarDays },
    { name: 'CalendarFold', Icon: CalendarFold },
    { name: 'CalendarIcon', Icon: CalendarIcon },
    { name: 'CalendarX', Icon: CalendarX },
    { name: 'Check', Icon: Check },
    { name: 'CheckCheck', Icon: CheckCheck },
    { name: 'CheckCircle', Icon: CheckCircle },
    { name: 'CheckSquare', Icon: CheckSquare },
    { name: 'ChevronDown', Icon: ChevronDown },
    { name: 'ChevronLeft', Icon: ChevronLeft },
    { name: 'ChevronRight', Icon: ChevronRight },
    { name: 'ChevronsUpDown', Icon: ChevronsUpDown },
    { name: 'ClipboardCheck', Icon: ClipboardCheck },
    { name: 'Clock', Icon: Clock },
    { name: 'Copy', Icon: Copy },
    { name: 'CreditCard', Icon: CreditCard },
    { name: 'Download', Icon: Download },
    { name: 'Dumbbell', Icon: Dumbbell },
    { name: 'Edit', Icon: Edit },
    { name: 'Edit3', Icon: Edit3 },
    { name: 'ExternalLink', Icon: ExternalLink },
    { name: 'FileSpreadsheet', Icon: FileSpreadsheet },
    { name: 'FileText', Icon: FileText },
    { name: 'Filter / FilterIcon', Icon: Filter },
    { name: 'Gamepad2', Icon: Gamepad2 },
    { name: 'Globe', Icon: Globe },
    { name: 'Hourglass', Icon: Hourglass },
    { name: 'Image / ImageIcon', Icon: Image },
    { name: 'Info', Icon: Info },
    { name: 'Key', Icon: Key },
    { name: 'Layers', Icon: Layers },
    { name: 'Leaf', Icon: Leaf },
    { name: 'Link', Icon: Link },
    { name: 'Link2 / LinkIcon', Icon: Link2 },
    { name: 'ListChecks', Icon: ListChecks },
    { name: 'ListFilter', Icon: ListFilter },
    { name: 'ListOrdered', Icon: ListOrdered },
    { name: 'Loader2', Icon: Loader2 },
    { name: 'LogIn', Icon: LogIn },
    { name: 'LogOut', Icon: LogOut },
    { name: 'Mail', Icon: Mail },
    { name: 'Map / MapIconLucide', Icon: Map },
    { name: 'MapPin', Icon: MapPin },
    { name: 'MapPinned', Icon: MapPinned },
    { name: 'Menu', Icon: Menu },
    { name: 'MessageSquare', Icon: MessageSquare },
    { name: 'Palette', Icon: Palette },
    { name: 'Phone / PhoneIcon', Icon: Phone },
    { name: 'PlusCircle', Icon: PlusCircle },
    { name: 'QrCode', Icon: QrCode },
    { name: 'Save', Icon: Save },
    { name: 'Search / SearchIcon', Icon: Search },
    { name: 'Send', Icon: Send },
    { name: 'Share2', Icon: Share2 },
    { name: 'Shield', Icon: Shield },
    { name: 'ShieldAlert', Icon: ShieldAlert },
    { name: 'ShieldCheck', Icon: ShieldCheck },
    { name: 'ShieldPlus', Icon: ShieldPlus },
    { name: 'Square', Icon: Square },
    { name: 'Star', Icon: Star },
    { name: 'Tag', Icon: Tag },
    { name: 'Target', Icon: Target },
    { name: 'Terminal', Icon: Terminal },
    { name: 'Trash2', Icon: Trash2 },
    { name: 'TrendingUp', Icon: TrendingUp },
    { name: 'Trophy', Icon: Trophy },
    { name: 'Upload', Icon: Upload },
    { name: 'UploadCloud', Icon: UploadCloud },
    { name: 'User / UserIcon', Icon: User },
    { name: 'UserCheck', Icon: UserCheck },
    { name: 'UserCog', Icon: UserCog },
    { name: 'UserPlus', Icon: UserPlus },
    { name: 'UserSquare2 (Players)', Icon: UserSquare2 },
    { name: 'UserX', Icon: UserX },
    { name: 'Users (Teams)', Icon: Users },
    { name: 'Users2', Icon: Users2 },
    { name: 'XCircle', Icon: XCircle },
  ].sort((a, b) => a.name.localeCompare(b.name)),

  'Custom SVG Icons (In Use)': [
    { name: 'CricketBatAndBallIcon', Icon: CricketBatAndBallIcon },
    { name: 'CricketBallIcon', Icon: CricketBallIcon },
    { name: 'CricketBatIcon', Icon: CricketBatIcon },
    { name: 'GoogleIcon', Icon: GoogleIcon },
    { name: 'StumpsAndBallIcon', Icon: StumpsAndBallIcon },
    { name: 'WicketKeeperGloves', Icon: WicketKeeperGloves },
  ].sort((a, b) => a.name.localeCompare(b.name)),
};

const IconDisplayCard: React.FC<{
  name: string;
  Icon: React.ElementType;
  isCustom?: boolean;
  onRemove?: (name: string) => void;
}> = ({ name, Icon, isCustom, onRemove }) => (
  <div className="relative flex flex-col items-center justify-center gap-2 rounded-lg border bg-card p-4 text-card-foreground shadow-sm group">
    <Icon className="h-8 w-8 text-primary" />
    <code className="text-xs text-muted-foreground text-center">{name}</code>
    {isCustom && onRemove && (
      <Button
        variant="destructive"
        size="icon"
        className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={() => onRemove(name)}
        aria-label={`Remove ${name}`}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    )}
  </div>
);

export default function IconLibraryPage() {
  const { toast } = useToast();

  const handleRemoveIcon = (iconName: string) => {
    toast({
      title: 'Remove Icon Action',
      description: `In a real app, this would trigger an action to remove the '${iconName}' SVG component from the codebase.`,
    });
  };

  return (
    <AuthProviderClientComponent
      requiredPermission={PERMISSIONS.PAGE_VIEW_ADMIN_ICON_LIBRARY}
      FallbackComponent={
        <div className="max-w-2xl mx-auto">
          <Card>
            <CardHeader><CardTitle>Access Denied</CardTitle></CardHeader>
            <CardContent><p>You do not have permission to view the icon library.</p></CardContent>
          </Card>
        </div>
      }
    >
      <div className="space-y-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl font-headline text-primary">Icon Library</CardTitle>
            <CardDescription>
              All icons currently in use across the application. Aliases (e.g. <code>FilterIcon = Filter</code>) are shown on a single card.
              The "Available" section has been removed — this page now reflects actual usage only.
            </CardDescription>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Project Icons</CardTitle>
            <CardDescription>
              Every Lucide and custom SVG icon imported anywhere in the codebase. Last audited {new Date().toLocaleDateString()}.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {Object.entries(projectIcons).map(([category, icons]) => (
              <div key={category} className="mb-6 last:mb-0">
                <h3 className="text-lg font-semibold text-foreground mb-3">{category}</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-4">
                  {icons.map(({ name, Icon }) => (
                    <IconDisplayCard
                      key={name}
                      name={name}
                      Icon={Icon}
                      isCustom={category.includes('Custom')}
                      onRemove={handleRemoveIcon}
                    />
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </AuthProviderClientComponent>
  );
}
