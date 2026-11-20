"use server";

import { revalidatePath } from "next/cache";
import { safeAction, type ActionResult } from "@/platform/action-result";
import { requireMemberForAction, toActor } from "@/platform/auth/session";
import type { WorkflowAction } from "@/platform/workflow";
import type { OrderAction } from "../domain/orders";
import * as mkt from "./service";

async function act<T>(fn: (actor: ReturnType<typeof toActor>) => Promise<T>): Promise<ActionResult<T>> {
  return safeAction(async () => {
    const me = await requireMemberForAction();
    const out = await fn(toActor(me));
    revalidatePath("/market", "layout");
    return out;
  });
}

export const registerSellerAction = async (input: unknown) => act((a) => mkt.registerSeller(a, input));
export const decideSellerAction = async (memberId: string, decision: "approve" | "reject" | "suspend" | "reinstate", reason?: string) =>
  act((a) => mkt.decideSeller(a, memberId, decision, reason));
export const createListingAction = async (input: unknown) => act((a) => mkt.createListing(a, input));
export const updateListingAction = async (id: string, input: unknown) => act((a) => mkt.updateListing(a, id, input));
export const listingTransitionAction = async (id: string, action: WorkflowAction, reason?: string) => act((a) => mkt.listingTransition(a, id, action, reason));
export const deleteListingAction = async (id: string) => act((a) => mkt.deleteListing(a, id));
export const toggleFavoriteAction = async (id: string) => act((a) => mkt.toggleFavorite(a, id));
export const addToCartAction = async (id: string, qty: number) => act((a) => mkt.addToCart(a, id, qty));
export const setCartQtyAction = async (id: string, qty: number) => act((a) => mkt.setCartQty(a, id, qty));
export const checkoutAction = async (input: unknown) => act((a) => mkt.checkout(a, input));
export const orderActionAction = async (orderId: string, action: OrderAction, reason?: string) => act((a) => mkt.orderAction(a, orderId, action, reason));
export const reviewItemAction = async (orderId: string, listingId: string, input: unknown) => act((a) => mkt.reviewItem(a, orderId, listingId, input));
