# syntax=docker/dockerfile:1
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY Directory.Build.props IskolarAid.sln ./
COPY src/IskolarAid.Core/IskolarAid.Core.csproj src/IskolarAid.Core/
COPY src/IskolarAid.Data/IskolarAid.Data.csproj src/IskolarAid.Data/
COPY src/IskolarAid.Api/IskolarAid.Api.csproj src/IskolarAid.Api/
COPY tests/IskolarAid.Tests/IskolarAid.Tests.csproj tests/IskolarAid.Tests/
RUN dotnet restore
COPY . .
RUN dotnet publish src/IskolarAid.Api -c Release -o /app --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
COPY --from=build /app .
RUN mkdir -p /app/uploads && chown -R $APP_UID /app/uploads
USER $APP_UID
ENV ASPNETCORE_URLS=http://+:8080 Uploads__Directory=/app/uploads
EXPOSE 8080
ENTRYPOINT ["dotnet", "IskolarAid.Api.dll"]
