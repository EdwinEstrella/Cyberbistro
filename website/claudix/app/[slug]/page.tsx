"use client";

import React, { useEffect, useState, useMemo } from "react";
import { useParams } from "next/navigation";
import { 
  ShoppingBag, 
  Utensils, 
  Check, 
  Plus, 
  Minus, 
  Phone, 
  Clock, 
  AlertCircle, 
  X,
  Loader2,
  Trash2,
  ChevronRight
} from "lucide-react";
import { insforgeClient } from "../lib/insforge";

interface DigitalMenuSettings {
  id: string;
  tenant_id: string;
  sucursal_id: string | null;
  enabled: boolean;
  public_slug: string;
  title: string | null;
  description: string | null;
  logo_url: string | null;
  banner_url: string | null;
  theme: any;
}

interface Plato {
  id: number;
  nombre: string;
  precio: number;
  categoria: string;
  disponible: boolean;
  sucursal_id?: string | null;
}

interface DigitalMenuItem {
  plato_id: number;
  display_name: string | null;
  description: string | null;
  image_url: string | null;
  visible: boolean;
  sort_order: number;
}

interface CartItem {
  plato: Plato;
  customName: string;
  customDescription: string;
  customImage: string | null;
  quantity: number;
  notes: string;
}

export default function DigitalMenuPage() {
  const { slug } = useParams();
  const [loading, setLoading] = useState(true);
  const [errorState, setErrorState] = useState<"not_found" | "disabled" | "network" | null>(null);
  
  // Data States
  const [settings, setSettings] = useState<DigitalMenuSettings | null>(null);
  const [platos, setPlatos] = useState<Plato[]>([]);
  const [menuItems, setMenuItems] = useState<DigitalMenuItem[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  
  // UI States
  const [selectedCategory, setSelectedCategory] = useState<string>("Todos");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  
  // Checkout Form
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [orderNotes, setOrderNotes] = useState("");
  const [submittingOrder, setSubmittingOrder] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState<string | null>(null); // holds order ID

  // Load Menu Data
  useEffect(() => {
    if (!slug) return;
    
    async function loadData() {
      try {
        setLoading(true);
        setErrorState(null);
        
        // 1. Fetch settings
        const { data: settingsData, error: settingsError } = await insforgeClient.database
          .from("digital_menu_settings")
          .select("*")
          .eq("public_slug", slug)
          .maybeSingle();

        if (settingsError) {
          console.error("Error loading settings:", settingsError);
          setErrorState("network");
          setLoading(false);
          return;
        }

        if (!settingsData) {
          setErrorState("not_found");
          setLoading(false);
          return;
        }

        if (!settingsData.enabled) {
          setErrorState("disabled");
          setLoading(false);
          return;
        }

        setSettings(settingsData);
        const tenantId = settingsData.tenant_id;

        // 2. Fetch platos, menu_categories, and digital_menu_items
        const [platosRes, menuItemsRes] = await Promise.all([
          insforgeClient.database
            .from("platos")
            .select("*")
            .eq("tenant_id", tenantId),
          insforgeClient.database
            .from("digital_menu_items")
            .select("*")
            .eq("tenant_id", tenantId)
        ]);

        if (platosRes.error || menuItemsRes.error) {
          console.error("Error loading items:", platosRes.error || menuItemsRes.error);
          setErrorState("network");
          setLoading(false);
          return;
        }

        const rawPlatos: Plato[] = platosRes.data || [];
        const rawMenuItems: DigitalMenuItem[] = menuItemsRes.data || [];

        setMenuItems(rawMenuItems);

        // Filter and enrich platos based on visibility in digital_menu_items
        // If sucursal_id is configured in settings, also filter by sucursal
        const activeSucursal = settingsData.sucursal_id;
        const filteredPlatos = rawPlatos.filter((plato) => {
          // If sucursal is configured, the dish must belong to it (or be null/global)
          if (activeSucursal && plato.sucursal_id && plato.sucursal_id !== activeSucursal) {
            return false;
          }
          
          const customItem = rawMenuItems.find((mi) => mi.plato_id === plato.id);
          if (customItem) {
            return customItem.visible;
          }
          return plato.disponible;
        });

        setPlatos(filteredPlatos);

        // Build unique category list
        const cats = Array.from(new Set(filteredPlatos.map((p) => p.categoria || "General")));
        setCategories(["Todos", ...cats]);

      } catch (err) {
        console.error("Unexpected error in loadData:", err);
        setErrorState("network");
      } finally {
        setLoading(false);
      }
    }

    void loadData();
  }, [slug]);

  // Enrich dishes with custom display properties from digital_menu_items
  const enrichedPlatos = useMemo(() => {
    return platos.map((plato) => {
      const customItem = menuItems.find((mi) => mi.plato_id === plato.id);
      return {
        ...plato,
        displayName: customItem?.display_name || plato.nombre,
        description: customItem?.description || "Delicioso plato preparado con ingredientes frescos de la casa.",
        image_url: customItem?.image_url || null,
        sortOrder: customItem?.sort_order || 0
      };
    }).sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return a.displayName.localeCompare(b.displayName);
    });
  }, [platos, menuItems]);

  // Filter enriched dishes by category
  const filteredPlatos = useMemo(() => {
    if (selectedCategory === "Todos") return enrichedPlatos;
    return enrichedPlatos.filter((p) => p.categoria === selectedCategory);
  }, [enrichedPlatos, selectedCategory]);

  // Cart Handlers
  const addToCart = (plato: any) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.plato.id === plato.id);
      if (existing) {
        return prev.map((item) => 
          item.plato.id === plato.id 
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [
        ...prev,
        {
          plato: { id: plato.id, nombre: plato.nombre, precio: plato.precio, categoria: plato.categoria, disponible: plato.disponible },
          customName: plato.displayName,
          customDescription: plato.description,
          customImage: plato.image_url,
          quantity: 1,
          notes: ""
        }
      ];
    });
  };

  const updateCartQuantity = (platoId: number, delta: number) => {
    setCart((prev) => {
      return prev.map((item) => {
        if (item.plato.id === platoId) {
          const newQty = item.quantity + delta;
          if (newQty <= 0) return null;
          return { ...item, quantity: newQty };
        }
        return item;
      }).filter(Boolean) as CartItem[];
    });
  };

  const updateCartNotes = (platoId: number, notes: string) => {
    setCart((prev) => 
      prev.map((item) => 
        item.plato.id === platoId ? { ...item, notes } : item
      )
    );
  };

  const removeFromCart = (platoId: number) => {
    setCart((prev) => prev.filter((item) => item.plato.id !== platoId));
  };

  const cartTotal = useMemo(() => {
    return cart.reduce((total, item) => total + item.plato.precio * item.quantity, 0);
  }, [cart]);

  const cartCount = useMemo(() => {
    return cart.reduce((total, item) => total + item.quantity, 0);
  }, [cart]);

  // Submit Order to Database
  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings || cart.length === 0) return;
    if (!customerName.trim()) return;

    try {
      setSubmittingOrder(true);

      // 1. Insert order
      const { data: orderData, error: orderError } = await insforgeClient.database
        .from("digital_orders")
        .insert([
          {
            tenant_id: settings.tenant_id,
            sucursal_id: settings.sucursal_id,
            customer_name: customerName.trim(),
            customer_phone: customerPhone.trim() || null,
            total: cartTotal,
            notes: orderNotes.trim() || null,
            status: "pending"
          }
        ])
        .select("id")
        .single();

      if (orderError || !orderData) {
        throw new Error(orderError?.message || "Failed to create order");
      }

      // 2. Insert order items
      const orderItems = cart.map((item) => ({
        tenant_id: settings.tenant_id,
        order_id: orderData.id,
        plato_id: item.plato.id,
        name_snapshot: item.customName,
        price_snapshot: item.plato.precio,
        quantity: item.quantity,
        notes: item.notes.trim() || null,
        subtotal: item.plato.precio * item.quantity
      }));

      const { error: itemsError } = await insforgeClient.database
        .from("digital_order_items")
        .insert(orderItems);

      if (itemsError) {
        throw new Error(itemsError.message);
      }

      // Success
      setOrderSuccess(orderData.id);
      setCart([]);
      setIsCartOpen(false);
      setCustomerName("");
      setCustomerPhone("");
      setOrderNotes("");
    } catch (err) {
      console.error("Failed to submit order:", err);
      alert("Hubo un error al enviar tu pedido. Por favor intenta de nuevo.");
    } finally {
      setSubmittingOrder(false);
    }
  };

  // Format prices helper
  const formatPrice = (amount: number) => {
    return new Intl.NumberFormat("es-DO", {
      style: "currency",
      currency: "DOP"
    }).format(amount);
  };

  // ─────────────────────────────────────────────
  // CONDITIONAL RENDER: Loading
  // ─────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-background p-6">
        <Loader2 className="w-12 h-12 text-primary animate-spin mb-4" />
        <p className="text-muted-foreground font-medium animate-pulse">Cargando menú digital...</p>
      </div>
    );
  }

  // ─────────────────────────────────────────────
  // CONDITIONAL RENDER: Errors
  // ─────────────────────────────────────────────
  if (errorState === "not_found") {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-background p-6 text-center">
        <AlertCircle className="w-16 h-16 text-destructive mb-4" />
        <h1 className="text-2xl font-bold mb-2">Restaurante no encontrado</h1>
        <p className="text-muted-foreground max-w-md">La dirección a la que intentas acceder no corresponde a ningún restaurante registrado en nuestro sistema.</p>
      </div>
    );
  }

  if (errorState === "disabled") {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-background p-6 text-center">
        <Utensils className="w-16 h-16 text-primary mb-4 animate-bounce" />
        <h1 className="text-2xl font-bold mb-2">Menú inactivo</h1>
        <p className="text-muted-foreground max-w-md">Este restaurante tiene su menú digital inactivo temporalmente. Por favor contacta al personal del local.</p>
      </div>
    );
  }

  if (errorState === "network") {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-background p-6 text-center">
        <AlertCircle className="w-16 h-16 text-amber-500 mb-4" />
        <h1 className="text-2xl font-bold mb-2">Error de conexión</h1>
        <p className="text-muted-foreground max-w-md mb-6">No pudimos conectar con los servicios de base de datos. Comprueba tu conexión a internet o reintenta.</p>
        <button onClick={() => window.location.reload()} className="gradient-primary text-primary-foreground px-6 py-2.5 font-semibold rounded-full hover:scale-105 transition-all border-none cursor-pointer">
          Reintentar Carga
        </button>
      </div>
    );
  }

  // ─────────────────────────────────────────────
  // CONDITIONAL RENDER: Order Success Screen
  // ─────────────────────────────────────────────
  if (orderSuccess) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-background p-6 text-center">
        <div className="w-20 h-20 bg-green-500/10 rounded-full flex items-center justify-center mb-6 border border-green-500/20">
          <Check className="w-10 h-10 text-green-500" />
        </div>
        <h1 className="text-3xl font-display font-800 tracking-tight mb-2">¡Pedido Enviado!</h1>
        <p className="text-muted-foreground max-w-md mb-1 text-sm sm:text-base">Tu orden ha sido registrada con éxito en el restaurante.</p>
        <p className="text-primary font-semibold text-xs mb-8 uppercase tracking-wider">Código de Orden: {orderSuccess.slice(0, 8)}</p>
        
        <div className="bg-card border border-border p-6 rounded-2xl max-w-md w-full mb-8 flex flex-col gap-4 text-left">
          <div className="flex gap-3 items-start">
            <Clock className="w-5 h-5 text-primary shrink-0 mt-0.5" />
            <div>
              <h4 className="font-semibold text-sm">Procesando Aprobación</h4>
              <p className="text-xs text-muted-foreground mt-1">El personal de caja revisará y aceptará tu pedido en breves momentos. Escucharán una notificación en el mostrador.</p>
            </div>
          </div>
          <div className="flex gap-3 items-start">
            <Phone className="w-5 h-5 text-primary shrink-0 mt-0.5" />
            <div>
              <h4 className="font-semibold text-sm">Contacto</h4>
              <p className="text-xs text-muted-foreground mt-1">Si hay dudas con los platos seleccionados, podrían contactarte al teléfono ingresado.</p>
            </div>
          </div>
        </div>

        <button 
          onClick={() => setOrderSuccess(null)} 
          className="gradient-primary text-primary-foreground px-8 py-3 font-semibold rounded-full hover:scale-105 transition-all border-none cursor-pointer"
        >
          Volver al Menú
        </button>
      </div>
    );
  }

  // ─────────────────────────────────────────────
  // MAIN DIGITAL MENU RENDER
  // ─────────────────────────────────────────────
  return (
    <div className="flex-1 flex flex-col bg-background min-h-screen relative overflow-x-hidden pb-24">
      {/* Banner / Cover */}
      <div className="w-full h-48 sm:h-64 relative bg-gradient-to-r from-primary/20 via-card to-accent/20 border-b border-border overflow-hidden">
        {settings?.banner_url ? (
          <img 
            src={settings.banner_url} 
            alt={settings.title || "Banner"} 
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/10 via-background to-transparent" />
        )}
      </div>

      {/* Restaurant Meta Info */}
      <div className="max-w-3xl mx-auto w-full px-6 -mt-16 sm:-mt-20 relative z-10 mb-8">
        <div className="flex flex-col sm:flex-row sm:items-end gap-4 sm:gap-6 mb-4">
          {/* Logo */}
          <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-card border-4 border-background flex items-center justify-center overflow-hidden shadow-lg shadow-black/30 shrink-0">
            {settings?.logo_url ? (
              <img 
                src={settings.logo_url} 
                alt={settings.title || "Logo"} 
                className="w-full h-full object-cover"
              />
            ) : (
              <Utensils className="w-10 h-10 text-primary" />
            )}
          </div>
          
          <div className="flex-1 min-w-0 pb-1">
            <h1 className="text-2xl sm:text-4xl font-display font-900 tracking-tight leading-tight mb-1">
              {settings?.title || "Nuestro Menú"}
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground font-medium flex items-center gap-2">
              <span className="w-2.5 h-2.5 bg-green-500 rounded-full animate-ping" />
              Menú Digital Activo
            </p>
          </div>
        </div>

        {settings?.description && (
          <p className="text-sm text-muted-foreground leading-relaxed">
            {settings.description}
          </p>
        )}
      </div>

      {/* Category Navigation (Sticky) */}
      <div className="sticky top-0 z-40 bg-background/95 backdrop-blur-md border-b border-border py-4 mb-6 shadow-sm">
        <div className="max-w-3xl mx-auto w-full px-6 flex gap-2 overflow-x-auto no-scrollbar scroll-smooth">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-4 py-2 text-xs font-semibold rounded-full whitespace-nowrap transition-all border cursor-pointer ${
                selectedCategory === cat
                  ? "gradient-primary text-primary-foreground border-transparent shadow-sm shadow-primary/25"
                  : "bg-card text-muted-foreground border-border hover:text-foreground hover:bg-muted"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Dish List */}
      <div className="max-w-3xl mx-auto w-full px-6 flex flex-col gap-6">
        {filteredPlatos.length === 0 ? (
          <div className="bg-card border border-border p-12 rounded-2xl text-center">
            <Utensils className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
            <h4 className="font-semibold text-sm">No hay platos disponibles</h4>
            <p className="text-xs text-muted-foreground mt-1">No se encontraron productos para la categoría seleccionada.</p>
          </div>
        ) : (
          filteredPlatos.map((plato) => {
            const inCart = cart.find((item) => item.plato.id === plato.id);
            return (
              <div 
                key={plato.id} 
                className="bg-card border border-border/60 p-4 sm:p-5 rounded-[20px] flex gap-4 items-start hover:border-border transition-all hover:shadow-sm"
              >
                {/* Image Placeholder or Actual Image */}
                <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-muted/30 border border-border flex items-center justify-center shrink-0 overflow-hidden">
                  {plato.image_url ? (
                    <img 
                      src={plato.image_url} 
                      alt={plato.displayName} 
                      className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <Utensils className="w-6 h-6 text-muted-foreground/30" />
                  )}
                </div>

                {/* Details */}
                <div className="flex-1 min-w-0 flex flex-col h-full justify-between gap-2">
                  <div>
                    <h3 className="font-semibold text-sm sm:text-base text-foreground leading-snug truncate">
                      {plato.displayName}
                    </h3>
                    <p className="text-xs text-muted-foreground leading-relaxed mt-1 line-clamp-2 pr-4">
                      {plato.description}
                    </p>
                  </div>
                  
                  <div className="flex items-center justify-between gap-4 mt-auto">
                    <span className="font-bold text-sm sm:text-base text-primary">
                      {formatPrice(plato.precio)}
                    </span>

                    {/* Add to Cart Actions */}
                    {inCart ? (
                      <div className="flex items-center bg-muted border border-border rounded-full p-1 gap-2">
                        <button 
                          onClick={() => updateCartQuantity(plato.id, -1)} 
                          className="w-7 h-7 flex items-center justify-center rounded-full bg-card hover:bg-muted border border-border cursor-pointer text-muted-foreground hover:text-foreground"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <span className="font-bold text-xs w-6 text-center">
                          {inCart.quantity}
                        </span>
                        <button 
                          onClick={() => updateCartQuantity(plato.id, 1)} 
                          className="w-7 h-7 flex items-center justify-center rounded-full bg-card hover:bg-muted border border-border cursor-pointer text-muted-foreground hover:text-foreground"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => addToCart(plato)}
                        className="bg-primary/10 text-primary border border-primary/25 hover:bg-primary hover:text-primary-foreground px-4 py-1.5 text-xs font-bold rounded-full transition-all cursor-pointer"
                      >
                        Agregar
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Floating Cart Bar */}
      {cart.length > 0 && (
        <div className="fixed bottom-6 inset-x-6 z-40 max-w-lg mx-auto">
          <button
            onClick={() => setIsCartOpen(true)}
            className="w-full gradient-primary text-primary-foreground p-4 rounded-full flex justify-between items-center shadow-xl shadow-primary/20 hover:scale-[1.02] hover:shadow-primary/30 transition-all border-none cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-primary-foreground/15 flex items-center justify-center text-sm font-bold">
                {cartCount}
              </div>
              <span className="font-bold text-sm">Ver mi pedido</span>
            </div>
            
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-sm">{formatPrice(cartTotal)}</span>
              <ChevronRight className="w-5 h-5 opacity-80" />
            </div>
          </button>
        </div>
      )}

      {/* Checkout Sidebar / Drawer */}
      {isCartOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <div 
            onClick={() => setIsCartOpen(false)} 
            className="absolute inset-0 bg-background/80 backdrop-blur-sm transition-opacity"
          />

          {/* Drawer Body */}
          <div className="relative w-full max-w-md bg-card border-l border-border h-full shadow-2xl flex flex-col z-10">
            {/* Header */}
            <div className="p-6 border-b border-border flex justify-between items-center">
              <div className="flex items-center gap-2">
                <ShoppingBag className="w-5 h-5 text-primary" />
                <h3 className="font-display font-800 text-lg">Mi Pedido</h3>
              </div>
              <button 
                onClick={() => setIsCartOpen(false)} 
                className="w-8 h-8 flex items-center justify-center rounded-full bg-muted/40 hover:bg-muted border border-border cursor-pointer text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Cart Items List */}
            <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">
              {cart.map((item) => (
                <div key={item.plato.id} className="flex gap-4 border-b border-border/40 pb-6 items-start">
                  <div className="w-16 h-16 rounded-xl bg-muted/30 border border-border flex items-center justify-center shrink-0 overflow-hidden">
                    {item.customImage ? (
                      <img src={item.customImage} alt={item.customName} className="w-full h-full object-cover" />
                    ) : (
                      <Utensils className="w-5 h-5 text-muted-foreground/30" />
                    )}
                  </div>
                  
                  <div className="flex-1 min-w-0 flex flex-col gap-2">
                    <div className="flex justify-between gap-3 items-start">
                      <h4 className="font-semibold text-sm leading-snug truncate">{item.customName}</h4>
                      <button 
                        onClick={() => removeFromCart(item.plato.id)} 
                        className="text-muted-foreground hover:text-destructive transition-colors shrink-0 bg-transparent border-none cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="flex items-center justify-between gap-4">
                      <span className="font-bold text-xs text-primary">{formatPrice(item.plato.precio * item.quantity)}</span>
                      
                      {/* Qty Actions */}
                      <div className="flex items-center bg-muted border border-border rounded-full p-0.5 gap-1.5">
                        <button 
                          onClick={() => updateCartQuantity(item.plato.id, -1)} 
                          className="w-6 h-6 flex items-center justify-center rounded-full bg-card hover:bg-muted border border-border cursor-pointer text-muted-foreground hover:text-foreground"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="font-bold text-xs w-4 text-center">{item.quantity}</span>
                        <button 
                          onClick={() => updateCartQuantity(item.plato.id, 1)} 
                          className="w-6 h-6 flex items-center justify-center rounded-full bg-card hover:bg-muted border border-border cursor-pointer text-muted-foreground hover:text-foreground"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                    </div>

                    {/* Notes field */}
                    <input 
                      type="text"
                      placeholder="Notas (ej. sin cebolla, bien cocido...)"
                      value={item.notes}
                      onChange={(e) => updateCartNotes(item.plato.id, e.target.value)}
                      className="bg-background border border-border rounded-lg px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/50 w-full focus:outline-none focus:border-primary/50"
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Footer Form / Actions */}
            <div className="p-6 border-t border-border bg-background/50 flex flex-col gap-4">
              <form onSubmit={handleSubmitOrder} className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] sm:text-xs font-semibold text-muted-foreground uppercase tracking-wider">Tu Nombre (Obligatorio)</label>
                  <input 
                    type="text" 
                    placeholder="Ej. Juan Pérez"
                    required
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="bg-card border border-border rounded-xl px-4 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary/50 placeholder:text-muted-foreground/45"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] sm:text-xs font-semibold text-muted-foreground uppercase tracking-wider">Teléfono (Opcional)</label>
                  <input 
                    type="tel" 
                    placeholder="Ej. 809-555-5555"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    className="bg-card border border-border rounded-xl px-4 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary/50 placeholder:text-muted-foreground/45"
                  />
                </div>
                <div className="flex flex-col gap-1.5 mb-2">
                  <label className="text-[10px] sm:text-xs font-semibold text-muted-foreground uppercase tracking-wider">Notas Generales del Pedido</label>
                  <textarea 
                    placeholder="Instrucciones adicionales para la cocina o entrega..."
                    value={orderNotes}
                    onChange={(e) => setOrderNotes(e.target.value)}
                    rows={2}
                    className="bg-card border border-border rounded-xl px-4 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary/50 placeholder:text-muted-foreground/45 resize-none"
                  />
                </div>

                <div className="flex justify-between items-center text-sm font-semibold mb-2">
                  <span className="text-muted-foreground">Total del Pedido:</span>
                  <span className="text-lg font-extrabold text-foreground">{formatPrice(cartTotal)}</span>
                </div>

                <button
                  type="submit"
                  disabled={submittingOrder || !customerName.trim()}
                  className="w-full gradient-primary text-primary-foreground p-4 rounded-full flex justify-center items-center font-bold text-sm shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-all border-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submittingOrder ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      Enviando Pedido...
                    </>
                  ) : (
                    "Confirmar y Enviar Pedido"
                  )}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
