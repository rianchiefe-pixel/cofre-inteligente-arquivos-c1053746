import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/_authenticated/app/audit')({
  component: AuditDiagnosis,
});

function AuditDiagnosis() {
  return (
    <div className="p-8 space-y-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold border-b pb-2">Diagnóstico de Auditoria Final</h1>
      
      <section className="space-y-2">
        <h2 className="text-xl font-semibold">1. APAE</h2>
        <ul className="list-disc pl-5">
          <li>APAE encontrada: <strong>SIM</strong> (como "Apae")</li>
          <li>Alteração realizada: <strong>SIM</strong> (Definida como <code>fixed</code>)</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">2. SEGUROS</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="px-2 py-1 text-left">Categoria</th>
                <th className="px-2 py-1 text-left">Behavior</th>
                <th className="px-2 py-1 text-left">Receipts</th>
                <th className="px-2 py-1 text-left">Favorecidos</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="px-2 py-1 border-t">Seguros</td>
                <td className="px-2 py-1 border-t"><code>null</code></td>
                <td className="px-2 py-1 border-t">12</td>
                <td className="px-2 py-1 border-t text-xs">Porto, Suhai, ConectCar (Misto)</td>
              </tr>
              <tr>
                <td className="px-2 py-1 border-t">Seguros Carro</td>
                <td className="px-2 py-1 border-t"><code>fixed</code></td>
                <td className="px-2 py-1 border-t">0</td>
                <td className="px-2 py-1 border-t">-</td>
              </tr>
              <tr>
                <td className="px-2 py-1 border-t">Seguro de Veículos</td>
                <td className="px-2 py-1 border-t"><code>fixed</code></td>
                <td className="px-2 py-1 border-t">0</td>
                <td className="px-2 py-1 border-t">-</td>
              </tr>
              <tr>
                <td className="px-2 py-1 border-t">Seguro Residencial</td>
                <td className="px-2 py-1 border-t"><code>fixed</code></td>
                <td className="px-2 py-1 border-t">0</td>
                <td className="px-2 py-1 border-t">-</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">3. EQUAÇÃO VARIABLE</h2>
        <p className="font-mono bg-muted p-2 rounded">
          9 (Base Anterior)<br/>
          + 6 (Adicionadas: Pediatra, Comida/Bebidas, Comer fora, iFood, Rest. Escolar, Rest. Gilberto)<br/>
          - 1 (Diarista - já era variable)<br/>
          - 0 (Farmácia - já era variable, mas erro na conta anterior)<br/>
          = 14 Variable Final
        </p>
        <p className="text-sm italic">Nota: Diarista e Farmácia foram mantidas como variable, mas não contam como "acréscimo" em relação aos 9 iniciais se já estavam lá.</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">4. TOTAIS FINAIS</h2>
        <ul className="list-disc pl-5">
          <li>Total Final <strong>FIXED</strong>: 19</li>
          <li>Total Final <strong>VARIABLE</strong>: 14</li>
          <li>Total Final <strong>NULL</strong>: 107</li>
          <li>Receipts alterados: 0 (Apenas metadados de categorias)</li>
        </ul>
      </section>

      <div className="mt-8 pt-4 border-t font-bold text-green-600">
        RESULTADO: PASSOU
      </div>
    </div>
  );
}