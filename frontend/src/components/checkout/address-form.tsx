"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import type { Address } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input, Label } from "@/components/ui/input";

const addressSchema = z.object({
  line1: z.string().min(3, "At least 3 characters"),
  line2: z.string().optional(),
  city: z.string().min(2, "At least 2 characters"),
  state: z.string().min(2, "At least 2 characters"),
  postal_code: z
    .string()
    .min(4, "At least 4 characters")
    .max(20, "Too long")
    .regex(/^[0-9A-Za-z -]+$/, "Letters, digits and spaces only"),
  country: z.string().length(2, "2-letter country code"),
  phone: z
    .string()
    .min(8, "At least 8 digits")
    .max(20, "Too long")
    .regex(/^[+0-9 ()-]+$/, "Enter a valid phone number"),
  is_default: z.boolean(),
});

export type AddressValues = z.infer<typeof addressSchema>;

export function AddressForm({
  onSubmit,
  defaultValues,
  submitLabel = "Save address",
  submitting,
}: {
  onSubmit: (values: AddressValues) => Promise<void> | void;
  defaultValues?: Partial<Address>;
  submitLabel?: string;
  submitting?: boolean;
}) {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<AddressValues>({
    resolver: zodResolver(addressSchema),
    defaultValues: {
      line1: defaultValues?.line1 ?? "",
      line2: defaultValues?.line2 ?? "",
      city: defaultValues?.city ?? "",
      state: defaultValues?.state ?? "",
      postal_code: defaultValues?.postal_code ?? "",
      country: defaultValues?.country ?? "IN",
      phone: defaultValues?.phone ?? "",
      is_default: defaultValues?.is_default ?? false,
    },
  });

  const isDefault = watch("is_default");

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="line1">Address line 1</Label>
          <Input id="line1" placeholder="Flat, house no., street" {...register("line1")} />
          {errors.line1 ? <p className="text-xs text-destructive">{errors.line1.message}</p> : null}
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="line2">Address line 2 (optional)</Label>
          <Input id="line2" placeholder="Landmark, area" {...register("line2")} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="city">City</Label>
          <Input id="city" {...register("city")} />
          {errors.city ? <p className="text-xs text-destructive">{errors.city.message}</p> : null}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="state">State</Label>
          <Input id="state" {...register("state")} />
          {errors.state ? <p className="text-xs text-destructive">{errors.state.message}</p> : null}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="postal_code">PIN code</Label>
          <Input id="postal_code" inputMode="numeric" {...register("postal_code")} />
          {errors.postal_code ? (
            <p className="text-xs text-destructive">{errors.postal_code.message}</p>
          ) : null}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="country">Country</Label>
          <Input id="country" maxLength={2} {...register("country")} />
          {errors.country ? (
            <p className="text-xs text-destructive">{errors.country.message}</p>
          ) : null}
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="phone">Phone</Label>
          <Input
            id="phone"
            inputMode="tel"
            placeholder="+91 98765 43210"
            {...register("phone")}
          />
          {errors.phone ? <p className="text-xs text-destructive">{errors.phone.message}</p> : null}
        </div>
      </div>

      <label className="flex cursor-pointer items-center gap-2.5 text-sm">
        <Checkbox
          checked={isDefault}
          onCheckedChange={(checked) => setValue("is_default", checked === true)}
        />
        Set as my default address
      </label>

      <Button type="submit" disabled={submitting}>
        {submitting ? <Loader2 className="animate-spin" /> : null}
        {submitLabel}
      </Button>
    </form>
  );
}
