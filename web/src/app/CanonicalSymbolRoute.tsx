import { Navigate, useParams } from "react-router-dom";

import { canonicalSymbolRoutePath } from "@/app/symbolRoutePath";
import { SymbolDetailPage } from "@/pages/SymbolDetailPage";

export function CanonicalSymbolRoute() {
  const routeSymbol = useParams().symbol;
  const canonicalPath = canonicalSymbolRoutePath(routeSymbol);

  return canonicalPath ? (
    <Navigate replace to={canonicalPath} />
  ) : (
    <SymbolDetailPage />
  );
}
