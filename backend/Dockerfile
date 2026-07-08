# Python 3.11.15 (Slim)
FROM python:3.11.15-slim@sha256:e031123e3d85762b141ad1cbc56452ba69c6e722ebf2f042cc0dc86c47c0d8b3

RUN apt-get update && apt-get upgrade -y \
 && apt-get install -y --no-install-recommends curl ca-certificates \
 && curl -fsSL https://download.docker.com/linux/static/stable/x86_64/docker-29.6.1.tgz \
      -o /tmp/docker.tgz \
 && tar -xzf /tmp/docker.tgz -C /tmp \
 && mv /tmp/docker/docker /usr/local/bin/docker \
 && rm -rf /tmp/docker /tmp/docker.tgz \
 && apt-get purge -y --auto-remove curl \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

RUN addgroup --system app && adduser --system --ingroup app app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY --chown=app:app . .

USER app

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

#FROM python:3.11-slim
#
## System-Updates minimal halten, keine unnötigen Tools
#RUN apt-get update && apt-get install -y docker.io && rm -rf /var/lib/apt/lists/*
#
#WORKDIR /app
#
#RUN addgroup --system app && adduser --system --ingroup app app
#
#COPY requirements.txt .
#RUN pip install --no-cache-dir -r requirements.txt
#
#COPY --chown=app:app . .
#
#USER app
#
#CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]


#FROM python:3.11-slim
#WORKDIR /app
#RUN apt-get update && apt-get install -y docker.io && rm -rf /var/lib/apt/lists/*
#COPY requirements.txt .
#RUN pip install -r requirements.txt
#COPY . .
#CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]



#FROM python:3.11-slim
#
#WORKDIR /app
#
## 1. System-Updates ausführen & offizielle Docker-CLI installieren
#RUN apt-get update && apt-get upgrade -y && apt-get install -y --no-install-recommends \
#    ca-certificates \
#    curl \
#    gnupg \
#    && mkdir -p /etc/apt/keyrings \
#    && curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg \
#    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian bookworm stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null \
#    && apt-get update && apt-get install -y --no-install-recommends \
#    docker-ce-cli \
#    && apt-get purge -y --auto-remove curl gnupg \
#    && rm -rf /var/lib/apt/lists/*
#
## 2. Python-Pip aktualisieren und Abhängigkeiten installieren
#COPY requirements.txt .
#RUN pip install --no-cache-dir --upgrade pip \
#    && pip install --no-cache-dir -r requirements.txt
#
## 3. Unnötige OS-Pakete (und deren unvollständig gepatchte CVEs) entfernen
## 'perl-base' erfordert '--allow-remove-essential'
# RUN apt-get update && apt-get remove -y --allow-remove-essential \
#    perl-base \
#    ncurses-bin \
#    ncurses-base \
#    && apt-get autoremove -y \
#    && rm -rf /var/lib/apt/lists/*
#
## 4. Anwendungs-Quellcode kopieren
#COPY . .
#
#CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]