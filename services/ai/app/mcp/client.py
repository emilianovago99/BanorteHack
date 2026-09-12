import json
from mcp import ClientSession


class FinancialTools:
    def __init__(self, session: ClientSession):
        self.session = session
        self.calls = []

    async def call(self, name, **arguments):
        result = await self.session.call_tool(name, arguments)
        if result.isError:
            raise ValueError("No se pudo completar la consulta financiera.")
        data = result.structuredContent
        if data is None:
            data = json.loads(next(part.text for part in result.content if part.type == "text"))
        self.calls.append(name)
        return data
