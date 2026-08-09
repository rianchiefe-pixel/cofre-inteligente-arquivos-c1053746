import { createFileRoute } from '@tanstack/react-router'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export const Route = createFileRoute('/')({
  component: HomeComponent,
})

function HomeComponent() {
  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Meu Cofre - Central de Gestão</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Bem-vindo ao seu sistema de gestão financeira inteligente.
            Utilize o menu lateral para navegar entre as seções.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
