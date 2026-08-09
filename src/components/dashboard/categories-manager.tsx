"use client";

import { useState } from "react";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { slugify } from "@/lib/utils";
import {
  createCategory,
  deleteCategory,
  updateCategory,
  type CategoryWithCount,
} from "@/actions/categories";

interface CategoryFormState {
  id?: string;
  name: string;
  slug: string;
  description: string;
  imageUrl: string;
  parentId: string;
  sortOrder: string;
  active: boolean;
}

const emptyForm: CategoryFormState = {
  name: "",
  slug: "",
  description: "",
  imageUrl: "",
  parentId: "",
  sortOrder: "0",
  active: true,
};

interface CategoriesManagerProps {
  initialCategories: CategoryWithCount[];
}

export function CategoriesManager({ initialCategories }: CategoriesManagerProps) {
  const [categories, setCategories] = useState(initialCategories);
  const [form, setForm] = useState<CategoryFormState>(emptyForm);
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEditing = Boolean(form.id);

  const resetForm = () => {
    setForm(emptyForm);
    setError(null);
    setIsOpen(false);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const payload = {
      name: form.name,
      slug: form.slug,
      description: form.description || null,
      imageUrl: form.imageUrl || null,
      parentId: form.parentId || null,
      sortOrder: Number(form.sortOrder) || 0,
      active: form.active,
    };

    try {
      if (isEditing) {
        await updateCategory(form.id!, payload);
        setCategories((current) =>
          current.map((category) =>
            category.id === form.id
              ? {
                  ...category,
                  name: payload.name,
                  slug: payload.slug,
                  description: payload.description,
                  image_url: payload.imageUrl,
                  parent_id: payload.parentId,
                  sort_order: payload.sortOrder,
                  active: payload.active,
                }
              : category
          )
        );
      } else {
        const category = await createCategory(payload);
        setCategories((current) => [...current, { ...category, productCount: 0 }]);
      }

      resetForm();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "No se pudo guardar la categoría"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (categoryId: string) => {
    const confirmed = window.confirm("Eliminar esta categoría?");
    if (!confirmed) return;

    try {
      await deleteCategory(categoryId);
      setCategories((current) =>
        current.filter((category) => category.id !== categoryId)
      );
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "No se pudo eliminar la categoría"
      );
    }
  };

  const startEdit = (category: CategoryWithCount) => {
    setForm({
      id: category.id,
      name: category.name,
      slug: category.slug,
      description: category.description || "",
      imageUrl: category.image_url || "",
      parentId: category.parent_id || "",
      sortOrder: String(category.sort_order),
      active: category.active,
    });
    setError(null);
    setIsOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">Categorías</h1>
          <p className="text-muted-foreground">
            {categories.length} categorías en el sitio
          </p>
        </div>
        <Button
          className="min-h-11 w-full sm:w-auto"
          onClick={() => {
            if (isOpen && !isEditing) {
              resetForm();
              return;
            }

            setForm(emptyForm);
            setError(null);
            setIsOpen(true);
          }}
        >
          <Plus className="mr-2 h-4 w-4" />
          Nueva categoría
        </Button>
      </div>

      {isOpen ? (
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-3">
            <CardTitle>
              {isEditing ? "Editar categoría" : "Crear categoría"}
            </CardTitle>
            <Button className="h-11 w-11" variant="ghost" size="icon" onClick={resetForm}>
              <X className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label htmlFor="name">Nombre</Label>
                  <Input
                    id="name"
                    value={form.name}
                    onChange={(event) => {
                      const nextName = event.target.value;
                      setForm((current) => ({
                        ...current,
                        name: nextName,
                        slug:
                          !current.id || current.slug === slugify(current.name)
                            ? slugify(nextName)
                            : current.slug,
                      }));
                    }}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="slug">Slug</Label>
                  <Input
                    id="slug"
                    value={form.slug}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        slug: slugify(event.target.value),
                      }))
                    }
                    required
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label htmlFor="parentId">Categoría superior</Label>
                  <select
                    id="parentId"
                    value={form.parentId}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        parentId: event.target.value,
                      }))
                    }
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="">Sin categoría superior</option>
                    {categories
                      .filter(
                        (category) =>
                          category.id !== form.id && !category.parent_id
                      )
                      .map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                  </select>
                </div>
                <label className="flex min-h-10 items-end gap-2 pb-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.active}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        active: event.target.checked,
                      }))
                    }
                  />
                  Visible en la tienda
                </label>
              </div>

              <div>
                <Label htmlFor="description">Descripcion</Label>
                <Input
                  id="description"
                  value={form.description}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label htmlFor="imageUrl">Imagen URL</Label>
                  <Input
                    id="imageUrl"
                    value={form.imageUrl}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        imageUrl: event.target.value,
                      }))
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="sortOrder">Orden</Label>
                  <Input
                    id="sortOrder"
                    type="number"
                    min="0"
                    value={form.sortOrder}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        sortOrder: event.target.value,
                      }))
                    }
                  />
                </div>
              </div>

              {error ? <p className="text-sm text-red-600">{error}</p> : null}

              <div className="grid gap-2 sm:flex">
                <Button className="min-h-11" type="submit" disabled={isSubmitting}>
                  {isSubmitting
                    ? "Guardando..."
                    : isEditing
                      ? "Guardar cambios"
                      : "Crear categoría"}
                </Button>
                <Button className="min-h-11" type="button" variant="outline" onClick={resetForm}>
                  Cancelar
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      <Card className="admin-responsive-table overflow-hidden">
        <CardContent className="p-0">
          <div className="relative w-full overflow-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50">
                <tr>
                  <th className="h-12 px-4 text-left font-medium">Nombre</th>
                  <th className="h-12 px-4 text-left font-medium">Slug</th>
                  <th className="h-12 px-4 text-left font-medium">Productos</th>
                  <th className="h-12 px-4 text-left font-medium">Superior</th>
                  <th className="h-12 px-4 text-left font-medium">Estado</th>
                  <th className="h-12 px-4 text-left font-medium">Orden</th>
                  <th className="h-12 px-4 text-left font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {categories.map((category) => (
                  <tr key={category.id} className="border-b">
                    <td className="p-4 font-medium" data-primary="true">{category.name}</td>
                    <td className="p-4 text-muted-foreground" data-label="Slug">{category.slug}</td>
                    <td className="p-4" data-label="Productos">{category.productCount}</td>
                    <td className="p-4 text-muted-foreground" data-label="Superior">
                      {category.parent_id
                        ? categories.find(
                            (parent) => parent.id === category.parent_id
                          )?.name || "No disponible"
                        : "Principal"}
                    </td>
                    <td className="p-4" data-label="Estado">
                      {category.active ? "Visible" : "Oculta"}
                    </td>
                    <td className="p-4" data-label="Orden">{category.sort_order}</td>
                    <td className="p-4" data-actions="true" data-label="Acciones">
                      <div className="flex items-center justify-end gap-2 md:justify-start">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-11 w-11"
                          onClick={() => startEdit(category)}
                        >
                          <Pencil className="h-4 w-4" />
                          <span className="sr-only">Editar {category.name}</span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-11 w-11 text-destructive hover:text-destructive"
                          onClick={() => handleDelete(category.id)}
                          disabled={category.productCount > 0}
                        >
                          <Trash2 className="h-4 w-4" />
                          <span className="sr-only">Eliminar {category.name}</span>
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!categories.length ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-muted-foreground">
                      No hay categorías todavía.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
